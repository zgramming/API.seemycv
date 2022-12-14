import Validator from "fastest-validator";
import { existsSync, mkdirSync, readFileSync, renameSync, unlink } from "fs";
import { Next, ParameterizedContext } from "koa";
import { parse } from "path";
import { cwd } from "process";
import sharp from "sharp";
import { v4 as uuidV4 } from "uuid";

import { PrismaClient } from "@prisma/client";

import { ERROR_TYPE_VALIDATION } from "../../utils/constant";
import { validationFile } from "../../utils/function";

const validator = new Validator();
const prisma = new PrismaClient();

const dirUpload = cwd() + "/public/images/cv/portfolio";
const baseUrlFile = "images/cv/portfolio";

export class CVPortfolioController {
  public static async get(ctx: ParameterizedContext, next: Next) {
    const { users_id } = ctx.params;

    let res = await prisma.cVPortfolio.findMany({
      include: { user: true, urls: true },
      where: { users_id: +users_id },
    });

    res = res.map((val) => {
      const thumbnail = `${ctx.origin}/${baseUrlFile}/${val.thumbnail}`;
      return { ...val, thumbnail };
    });

    return (ctx.body = {
      data: res,
      success: true,
    });
  }

  public static async getById(ctx: ParameterizedContext, next: Next) {
    const { id } = ctx.params;
    let res = await prisma.cVPortfolio.findFirstOrThrow({
      where: { id: id ?? "" },
      include: {
        urls: true,
      },
    });

    res.thumbnail = `${ctx.origin}/${baseUrlFile}/${res.thumbnail}`;

    ctx.status = 200;
    return (ctx.body = {
      success: true,
      data: res,
    });
  }

  public static async upsert(ctx: ParameterizedContext, next: Next) {
    try {
      const createDir = mkdirSync(dirUpload, { recursive: true });
      const {
        id,
        users_id = 0,
        title,
        slug,
        description,
        tags,
        urls,
      }: {
        id?: string;
        users_id?: number;
        title: string;
        slug: string;
        description: string;
        tags?: Array<string>;
        urls?: string;
      } = ctx.request.body;
      const files = ctx.request.files;
      const portfolio = await prisma.cVPortfolio.findFirst({
        where: { id: id ?? "" },
      });

      const data = {
        id: portfolio?.id,
        users_id: +users_id,
        title,
        slug,
        description,
        tags,
        thumbnail: portfolio?.thumbnail,
      };

      console.log({
        body: ctx.request.body,
        file: ctx.request.files,
      });

      const schema = {
        id: { type: "string", optional: true },
        users_id: { type: "number" },
        title: { type: "string" },
        slug: { type: "string" },
        description: { type: "string" },
      };

      const createSchema = validator.compile(schema);
      const checkSchema = await createSchema(data);

      if (checkSchema !== true) {
        ctx.status = 400;
        return (ctx.body = {
          success: false,
          type: ERROR_TYPE_VALIDATION,
          message: checkSchema,
        });
      }

      if (files?.thumbnail) {
        const file = files!.thumbnail as any;
        const { size, mimetype, originalFilename, filepath } = file;
        const validateFile = validationFile({
          file: file,
          allowedMimetype: ["png", "jpg", "jpeg"],
          limitSizeMB: 5,
          onError(message) {
            ctx.status = 400;
            throw new Error(message);
          },
        });

        const {
          base: baseOri,
          name: nameOri,
          ext: extOri,
        } = parse(originalFilename);

        const filename = portfolio?.thumbnail
          ? portfolio.thumbnail
          : uuidV4() + extOri;

        const {
          base: basePortfolioFile,
          name: namePortfolioFile,
          ext: extPortfolioFile,
        } = parse(filename);

        const fullname = namePortfolioFile + extOri;

        /// Jika file yang diupload extensionnya berbeda dengan file yang sudah ada
        /// Maka file yang lama akan dihapus
        if (extOri !== extPortfolioFile && portfolio?.thumbnail) {
          unlink(dirUpload + "/" + portfolio.thumbnail, (err) => {
            if (err) {
              console.log({ error_delete_image_portfolio: err });
            }
            console.log("success delete file portfolio");
          });
        }

        /// Upload image
        const fullPath = `${dirUpload}/${fullname}`;
        renameSync(file.filepath, fullPath);

        const buffer = readFileSync(fullPath);
        sharp(buffer)
          .resize(400)
          .jpeg({ quality: 70 })
          .png({ quality: 70 })
          .toFile(fullPath);

        /// Adding object into request body
        data.thumbnail = fullname;
      }

      const parseUrls = urls
        ? (JSON.parse(urls) as Array<{ nameurl: string; contenturl: string }>)
        : undefined;

      if (!portfolio) {
        /// insert
        const create = await prisma.cVPortfolio.create({
          include: { user: true, urls: true },
          data: {
            ...data,
            urls: {
              createMany: parseUrls && {
                data: parseUrls.map((val) => {
                  return {
                    name: val.nameurl,
                    url: val.contenturl,
                    users_id: +users_id,
                  };
                }),
              },
            },
          },
        });
        ctx.body = 200;
        return (ctx.body = {
          success: true,
          message: "Berhasil menambah Portofolio",
          data: create,
        });
      } else {
        /// update
        const update = await prisma.cVPortfolio.update({
          include: { user: true, urls: true },
          data: {
            ...data,
            urls: {
              deleteMany: { users_id: +users_id },
              createMany: parseUrls && {
                data: parseUrls.map((val) => {
                  return {
                    name: val.nameurl,
                    url: val.contenturl,
                    users_id: +users_id,
                  };
                }),
              },
            },
          },
          where: { id: portfolio.id },
        });
        ctx.body = 200;
        return (ctx.body = {
          success: true,
          message: "Berhasil mengupdate Portofolio",
          data: update,
        });
      }
    } catch (error: any) {
      console.log({ error: error });
      ctx.status = error.statusCode || error.status || 500;
      ctx.body = {
        success: false,
        message: error.message,
      };
    }
  }

  public static async delete(ctx: ParameterizedContext, next: Next) {
    try {
      const { id } = ctx.params;
      const licenseCertificate = await prisma.cVPortfolio.findFirst({
        where: { id },
      });
      if (!licenseCertificate) {
        return ctx.throw(
          404,
          new Error("Portofolio tidak ditemukan dengan id " + id)
        );
      }

      const del = await prisma.cVPortfolio.delete({
        where: { id: licenseCertificate?.id },
      });

      const pathFile = dirUpload + `/${del.thumbnail}`;
      if (existsSync(pathFile))
        unlink(pathFile, (err) => {
          if (err) {
            console.log({ error_delete_image_portfolio: err });
          }
          console.log("success delete file portfolio");
        });

      ctx.status = 200;
      return (ctx.body = {
        message: `Portofolio dengan id ${del.id} berhasil dihapus`,
        data: del,
      });
    } catch (error: any) {
      console.log({ error: error });
      ctx.status = error.statusCode || error.status || 500;
      ctx.body = {
        success: false,
        message: error.message,
      };
    }
  }
}

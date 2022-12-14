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

const prisma = new PrismaClient();
const validator = new Validator();

const baseUrlImage = "images/cv/experience";
const directory = "/public/" + baseUrlImage;
const dirUpload = cwd() + directory;

export class CVExperienceController {
  public static async get(ctx: ParameterizedContext, next: Next) {
    const { users_id } = ctx.params;

    let res = await prisma.cVExperience.findMany({
      include: { user: true },
      where: { users_id: +users_id },
    });

    res = res.map((val) => {
      if (val.image_company) {
        const imageUrl = `${ctx.origin}/${baseUrlImage}/${val.image_company}`;
        return { ...val, image_company: imageUrl };
      }
      return val;
    });

    return (ctx.body = {
      data: res,
      success: true,
    });
  }

  public static async upsert(ctx: ParameterizedContext, next: Next) {
    try {
      const createDir = mkdirSync(dirUpload, { recursive: true });

      const {
        id,
        users_id,
        company,
        job,
        location,
        start_date,
        end_date,
        description,
        is_graduated,
        tags,
      } = ctx.request.body;

      const exp = await prisma.cVExperience.findFirst({
        where: { id: id ?? "" },
      });

      const data = {
        id: exp?.id,
        users_id: +users_id,
        company,
        job,
        location: location ?? null,
        start_date: new Date(start_date),
        end_date: new Date(end_date),
        description: description ?? null,
        is_graduated: +is_graduated ? true : false,
        tags: tags ?? null,
        image_company: exp?.image_company ?? null,
      };

      console.log({
        body: data,
        file: ctx.request.files,
      });

      const files = ctx.request.files;

      const schema = {
        id: { type: "string", optional: true },
        users_id: { type: "number" },
        company: { type: "string" },
        job: { type: "string" },
        start_date: { type: "date" },
        ...(end_date && { end_date: "date" }),
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
      if (files?.image_company) {
        const file = files!.image_company as any;
        const { size, mimetype, originalFilename, filepath } = file;
        const validateFile = validationFile({
          file: file,
          allowedMimetype: ["png", "jpeg", "jpg"],
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

        const filename = exp?.image_company
          ? exp.image_company
          : uuidV4() + extOri;

        const {
          base: baseExpFile,
          name: nameExpFile,
          ext: extExpFile,
        } = parse(filename);

        const fullname = nameExpFile + extOri;

        /// Jika file yang diupload extensionnya berbeda dengan file yang sudah ada
        /// Maka file yang lama akan dihapus
        if (extOri !== extExpFile && exp?.image_company) {
          unlink(dirUpload + "/" + exp.image_company, (err) => {
            if (err) {
              console.log({ error_experience: err });
            }
            console.log("success delete image experience");
          });
        }

        /// Upload image
        const fullPath = `${dirUpload}/${fullname}`;
        renameSync(file.filepath, fullPath);

        const buffer = readFileSync(fullPath);
        sharp(buffer)
          .resize(200)
          .jpeg({ quality: 70 })
          .png({ quality: 70 })
          .toFile(fullPath);

        /// Adding object into request body
        data.image_company = fullname;
      }

      if (!exp) {
        const create = await prisma.cVExperience.create({
          include: { user: true },
          data: data,
        });
        ctx.body = 200;
        return (ctx.body = {
          success: true,
          message: "Berhasil menambah pengalaman baru",
          data: create,
        });
      } else {
        const update = await prisma.cVExperience.update({
          include: { user: true },
          data: data,
          where: { id: exp.id },
        });
        ctx.body = 200;
        return (ctx.body = {
          success: true,
          message: "Berhasil mengupdate pengalaman baru",
          data: update,
        });
      }
    } catch (error: any) {
      console.log({ error: error });
      ctx.status = error.statusCode || error.status || 500;
      return (ctx.body = {
        success: false,
        message: error.message,
      });
    }
  }

  public static async delete(ctx: ParameterizedContext, next: Next) {
    try {
      const { id } = ctx.params;
      const exp = await prisma.cVExperience.findFirst({ where: { id } });
      if (!exp) {
        return ctx.throw(
          404,
          new Error("Pengalaman tidak ditemukan dengan id " + id)
        );
      }

      const del = await prisma.cVExperience.delete({ where: { id: exp?.id } });
      const pathImage = dirUpload + `/${del.image_company}`;
      if (existsSync(pathImage)) {
        unlink(pathImage, (err) => {
          if (err) {
            console.log({ error_delete_experience: err });
          }

          console.log("success delete image experience");
        });
      }

      ctx.status = 200;
      return (ctx.body = {
        message: `Pengalaman dengan id ${del.id} berhasil dihapus`,
        data: del,
      });
    } catch (error: any) {
      console.log({ error: error });
      ctx.status = error.statusCode || error.status || 500;
      return (ctx.body = {
        success: false,
        message: error.message,
      });
    }
  }
}

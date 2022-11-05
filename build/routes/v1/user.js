"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bcrypt_1 = require("bcrypt");
const fastest_validator_1 = __importDefault(require("fastest-validator"));
const koa_router_1 = __importDefault(require("koa-router"));
const client_1 = require("@prisma/client");
const constant_1 = require("../../utils/constant");
const prisma = new client_1.PrismaClient();
const V1UserRouter = new koa_router_1.default({ prefix: "/api/v1/user" });
const baseUrlFileProfile = "file/cv/profile";
const baseUrlFileLicenseCertificate = "file/cv/license_certificate";
const baseUrlImagesProfile = "images/cv/profile";
const baseUrlImagesExperience = "images/cv/experience";
const baseUrlImagesEducation = "images/cv/education";
const baseUrlImagesPortfolio = "images/cv/portfolio";
const validator = new fastest_validator_1.default();
V1UserRouter.get("/:username", (ctx, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { username } = ctx.params;
        const isExists = yield prisma.users.count({
            where: {
                username: username,
            },
        });
        if (isExists <= 0) {
            ctx.status = 404;
            ctx.throw(404, new Error("User tidak ditemukan"));
        }
        const result = yield prisma.users.findFirstOrThrow({
            where: {
                username: username,
            },
            include: {
                CVSkill: {
                    include: { level: true },
                    orderBy: {
                        level: {
                            order: "desc",
                        },
                    },
                },
                CVExperience: {
                    orderBy: {
                        start_date: "desc",
                    },
                },
                CVEducation: {
                    orderBy: {
                        start_date: "desc",
                    },
                },
                CVLicenseCertificate: {
                    orderBy: {
                        start_date: "desc",
                    },
                },
                CVProfile: true,
                CVPortfolio: true,
            },
        });
        const profile = result.CVProfile;
        if (profile) {
            if (profile.image && profile.image !== "") {
                profile.image = `${ctx.origin}/${baseUrlImagesProfile}/${profile.image}`;
            }
            if (profile.banner_image && profile.banner_image !== "") {
                profile.banner_image = `${ctx.origin}/${baseUrlImagesProfile}/${profile.banner_image}`;
            }
            if (profile.latest_resume && profile.latest_resume !== "") {
                profile.latest_resume = `${ctx.origin}/${baseUrlFileProfile}/${profile.latest_resume}`;
            }
        }
        result.CVExperience = result.CVExperience.map((val) => {
            if (val.image_company && val.image_company !== "") {
                val.image_company = `${ctx.origin}/${baseUrlImagesExperience}/${val.image_company}`;
            }
            return Object.assign({}, val);
        });
        result.CVEducation = result.CVEducation.map((val) => {
            if (val.image && val.image !== "") {
                val.image = `${ctx.origin}/${baseUrlImagesEducation}/${val.image}`;
            }
            return Object.assign({}, val);
        });
        result.CVLicenseCertificate = result.CVLicenseCertificate.map((val) => {
            if (val.file && val.file !== "") {
                val.file = `${ctx.origin}/${baseUrlFileLicenseCertificate}/${val.file}`;
            }
            return Object.assign({}, val);
        });
        result.CVPortfolio = result.CVPortfolio.map((val) => {
            if (val.thumbnail && val.thumbnail !== "") {
                val.thumbnail = `${ctx.origin}/${baseUrlImagesPortfolio}/${val.thumbnail}`;
            }
            return Object.assign({}, val);
        });
        const data = Object.assign(Object.assign({}, result), { CVProfile: profile });
        ctx.status = 200;
        ctx.body = {
            data: data,
            message: "Berhasil mendapatkan user dengan username " + username,
        };
    }
    catch (error) {
        console.log({ error: error });
        ctx.status = error.statusCode || error.status || 500;
        ctx.body = {
            success: false,
            message: error.message,
        };
    }
}));
V1UserRouter.post("/signup", (ctx, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const saltRounds = 10;
        const { username, password, email } = ctx.request.body;
        const data = {
            username,
            password,
            email,
            name: username,
        };
        const schema = {
            username: { type: "string", min: 8, alphadash: true },
            password: { type: "string", min: 8 },
            email: { type: "email" },
        };
        const createSchema = validator.compile(schema);
        const check = yield createSchema(Object.assign({}, data));
        if (check !== true) {
            ctx.status = 400;
            return (ctx.body = {
                success: false,
                type: constant_1.ERROR_TYPE_VALIDATION,
                message: check,
            });
        }
        const groupUser = yield prisma.appGroupUser.findFirstOrThrow({
            where: {
                code: "user",
            },
        });
        const create = yield prisma.users.create({
            data: Object.assign(Object.assign({}, data), { status: "process_verification", password: (0, bcrypt_1.hashSync)(password, saltRounds), app_group_user_id: groupUser.id }),
        });
        ctx.status = 200;
        ctx.body = {
            success: true,
            message: "Berhasil membuat user dengan username " + username,
            data: create,
        };
    }
    catch (error) {
        ctx.status = error.statusCode || error.status || 500;
        ctx.body = {
            success: false,
            message: error.message,
        };
    }
}));
exports.default = V1UserRouter;

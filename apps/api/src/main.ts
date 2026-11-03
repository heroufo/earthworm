import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

import { AppModule } from "./app/app.module";
import { appGlobalMiddleware } from "./app/useGlobal";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // 网页端导入课程包时 CSV 文本走 JSON body，默认 100kb 限制不够
  app.useBodyParser("json", { limit: "10mb" });
  app.enableCors({
    // 本地版：localhost 和 127.0.0.1 都要放行，
    // 否则用 127.0.0.1:3000 打开时所有接口都会被浏览器拦掉
    origin: [
      /^http:\/\/localhost(:\d+)?$/,
      /^http:\/\/127\.0\.0\.1(:\d+)?$/,
      /^http:\/\/earthworm\.cuixueshe\.com(:81)?$/,
    ],
  });

  appGlobalMiddleware(app);
  const config = new DocumentBuilder()
    .setTitle("EarthWorm Swagger")
    .setDescription("The EarthWorm API description")
    .setVersion("v1.0")
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("/swagger", app, document);
  await app.listen(process.env.PORT || 3001);
}

bootstrap();

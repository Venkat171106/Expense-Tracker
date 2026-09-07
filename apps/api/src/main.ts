import { NestFactory } from "@nestjs/core";
import { ValidationPipe, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AppModule } from "./app.module";
import { BigIntInterceptor } from "./common/interceptors/bigint.interceptor";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";

async function bootstrap() {
  const logger = new Logger("Bootstrap");
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);
  const port = configService.get<number>("PORT") || 4000;
  const apiPrefix = configService.get<string>("API_PREFIX") || "api/v1";

  app.setGlobalPrefix(apiPrefix);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalInterceptors(new BigIntInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());

  const corsOrigins = configService.get<string>("CORS_ORIGINS") || "*";
  app.enableCors({
    origin: corsOrigins.split(","),
    credentials: true,
  });

  await app.listen(port);
  logger.log(
    "Personal Finance OS API running on port " +
      port +
      " with prefix " +
      apiPrefix,
  );
}
bootstrap();

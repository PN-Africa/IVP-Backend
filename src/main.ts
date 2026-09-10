import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS
  app.enableCors({
    origin: [
    'http://localhost:3000',
    'http://localhost:3001', // The port your frontend is currently using
    'http://localhost:7000',
    'https://www.ivpafrica.site',
    'https://ivpafrica.site',
    'https://ivp-africa-web.vercel.app',
    'https://ivp-africa-pn-africa.vercel.app',
    'https://ivp-africa.vercel.app', // Removed the trailing slash (crucial for CORS)
    process.env.FRONTEND_URL, // Good practice to pull from environment variables
   ].filter(Boolean), 
   methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
   allowedHeaders: ['Content-Type', 'Authorization'],
   credentials: true,
  });

  // 1. Enforce a clean architectural prefix for version routing API contracts
  app.setGlobalPrefix('api/v1');

  // 2. Register our global pipeline to drop unformatted payload objects[cite: 3, 5]
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Automatically strips properties not defined in our input DTOs
      forbidNonWhitelisted: true, // Explicitly throws errors if unexpected payloads are sent
      transform: true, // Automatically converts network payloads to typed execution instances
    }),
  );

  // 3. Bind our unified custom JSON layout error interceptor
  app.useGlobalFilters(new HttpExceptionFilter());

  // 4. Setup OpenAPI / Swagger (disabled in production by default)
  const config = new DocumentBuilder()
    .setTitle('IVP Africa API')
    .setDescription('IVP Africa backend API documentation')
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'JWT')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 7000;
  await app.listen(port);
  console.log(`IVP Africa API is operating on: http://localhost:${port}`);
}
bootstrap();

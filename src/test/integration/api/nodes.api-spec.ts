import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CleanupInterceptor } from 'src/interceptors/cleanup.interceptor';
import { FieldsInterceptor } from 'src/interceptors/fields.interceptor';
import { PublicAppModule } from 'src/public.app.module';
import { ApiChecker } from 'src/utils/api.checker.utils';

describe("API Testing", () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PublicAppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalInterceptors(
      new FieldsInterceptor(),
      new CleanupInterceptor(),
    );
    await app.init();
  });

  it("/nodes", async () => {
    const checker = new ApiChecker('nodes', app.getHttpServer());
    await checker.checkStatus();
    await checker.checkPagination();
    await checker.checkDetails();
    await checker.checkFilter(['shard']);
    await checker.checkAlternativeCount(['type', 'online']);
  });
});

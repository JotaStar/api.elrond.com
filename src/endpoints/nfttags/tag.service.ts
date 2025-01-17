import { forwardRef, Inject, Injectable } from "@nestjs/common";
import { QueryPagination } from "src/common/entities/query.pagination";
import { CachingService } from "src/common/caching/caching.service";
import { ApiUtils } from "src/utils/api.utils";
import { Constants } from "src/utils/constants";
import { Tag } from "./entities/tag";
import { ElasticService } from "src/common/elastic/elastic.service";
import { ElasticSortOrder } from "src/common/elastic/entities/elastic.sort.order";
import { ElasticQuery } from "src/common/elastic/entities/elastic.query";
import { BinaryUtils } from "src/utils/binary.utils";

@Injectable()
export class TagService {

  constructor(
    private readonly elasticService: ElasticService,
    @Inject(forwardRef(() => CachingService))
    private readonly cachingService: CachingService,
  ) { }

  async getNftTags(pagination: QueryPagination, search?: string): Promise<Tag[]> {
    if (search) {
      return await this.getNftTagsRaw(pagination, search);
    }

    return await this.cachingService.getOrSetCache(
      `nftTags:${pagination.from}:${pagination.size}`,
      async () => await this.getNftTagsRaw(pagination),
      Constants.oneHour(),
    );
  }

  async getNftTagCount(search?: string): Promise<number> {
    if (search) {
      return this.getNftTagCountRaw(search);
    }

    return await this.cachingService.getOrSetCache(
      'nftTagsCount',
      async () => await this.getNftTagCountRaw(),
      Constants.oneHour()
    );
  }

  private async getNftTagCountRaw(search?: string): Promise<number> {
    const query = this.buildNftTagQuery(search);

    return await this.elasticService.getCount('tags', query);
  }

  private buildNftTagQuery(search?: string): ElasticQuery {
    return ElasticQuery.create()
      .withSearchWildcardCondition(search, ['tag']);
  }

  async getNftTagsRaw(pagination: QueryPagination, search?: string): Promise<Tag[]> {
    const elasticQuery = ElasticQuery.create()
      .withPagination(pagination)
      .withSearchWildcardCondition(search, ['tag'])
      .withSort([{ name: 'count', order: ElasticSortOrder.descending }]);

    const result = await this.elasticService.getList('tags', 'tag', elasticQuery);

    return result.map(item => ApiUtils.mergeObjects(new Tag(), item));
  }

  async getNftTag(tag: string): Promise<Tag> {
    const result = await this.elasticService.getItem('tags', 'tag', BinaryUtils.base64Encode(tag));

    return ApiUtils.mergeObjects(new Tag(), result);
  }
}

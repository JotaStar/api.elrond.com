import { forwardRef, Inject, Injectable } from "@nestjs/common";
import { ApiConfigService } from "src/common/api-config/api.config.service";
import { ElasticService } from "src/common/elastic/elastic.service";
import { QueryPagination } from "src/common/entities/query.pagination";
import { BinaryUtils } from "src/utils/binary.utils";
import { EsdtService } from "../esdt/esdt.service";
import { CollectionFilter } from "./entities/collection.filter";
import { NftCollection } from "./entities/nft.collection";
import { NftType } from "../nfts/entities/nft.type";
import { TokenAssetService } from "../tokens/token.asset.service";
import { VmQueryService } from "../vm.query/vm.query.service";
import { NftCollectionRole } from "./entities/nft.collection.role";
import { QueryType } from "src/common/elastic/entities/query.type";
import { QueryOperator } from "src/common/elastic/entities/query.operator";
import { ElasticQuery } from "src/common/elastic/entities/elastic.query";
import { ElasticSortOrder } from "src/common/elastic/entities/elastic.sort.order";
import { TokenProperties } from "../tokens/entities/token.properties";
import { CachingService } from "src/common/caching/caching.service";
import { CacheInfo } from "src/common/caching/entities/cache.info";
import { RecordUtils } from "src/utils/record.utils";
import { TokenAssets } from "../tokens/entities/token.assets";
import { EsdtAddressService } from "../esdt/esdt.address.service";
import { CollectionRoles } from "../tokens/entities/collection.roles";
import { TokenUtils } from "src/utils/token.utils";
import { QueryConditionOptions } from "src/common/elastic/entities/query.condition.options";
import { NftCollectionAccount } from "./entities/nft.collection.account";
import { ApiUtils } from "src/utils/api.utils";

@Injectable()
export class CollectionService {
  constructor(
    private readonly apiConfigService: ApiConfigService,
    private readonly elasticService: ElasticService,
    private readonly esdtService: EsdtService,
    private readonly tokenAssetService: TokenAssetService,
    private readonly vmQueryService: VmQueryService,
    private readonly cachingService: CachingService,
    @Inject(forwardRef(() => EsdtAddressService))
    private readonly esdtAddressService: EsdtAddressService,
  ) { }

  buildCollectionRolesFilter(filter: CollectionFilter, address?: string) {
    let elasticQuery = ElasticQuery.create();
    elasticQuery = elasticQuery.withMustNotExistCondition('identifier');

    if (address) {
      if (this.apiConfigService.getIsIndexerV3FlagActive()) {
        elasticQuery = elasticQuery.withMustCondition(QueryType.Should(
          [
            QueryType.Match('currentOwner', address),
            QueryType.Nested('roles', { 'roles.ESDTRoleNFTCreate': address }),
            QueryType.Nested('roles', { 'roles.ESDTRoleNFTBurn': address }),
            QueryType.Nested('roles', { 'roles.ESDTRoleNFTAddQuantity': address }),
            QueryType.Nested('roles', { 'roles.ESDTRoleNFTUpdateAttributes': address }),
            QueryType.Nested('roles', { 'roles.ESDTRoleNFTAddURI': address }),
            QueryType.Nested('roles', { 'roles.ESDTTransferRole': address }),
          ]
        ));
      } else {
        elasticQuery = elasticQuery.withMustCondition(QueryType.Match('currentOwner', address));
      }
    }

    if (this.apiConfigService.getIsIndexerV3FlagActive()) {
      if (filter.canCreate !== undefined) {
        elasticQuery = this.getRoleCondition(elasticQuery, 'ESDTRoleNFTCreate', address, filter.canCreate);
      }

      if (filter.canBurn !== undefined) {
        elasticQuery = this.getRoleCondition(elasticQuery, 'ESDTRoleNFTBurn', address, filter.canBurn);
      }

      if (filter.canAddQuantity !== undefined) {
        elasticQuery = this.getRoleCondition(elasticQuery, 'ESDTRoleNFTAddQuantity', address, filter.canAddQuantity);
      }

      if (filter.canUpdateAttributes !== undefined) {
        elasticQuery = this.getRoleCondition(elasticQuery, 'ESDTRoleNFTUpdateAttributes', address, filter.canUpdateAttributes);
      }

      if (filter.canAddUri !== undefined) {
        elasticQuery = this.getRoleCondition(elasticQuery, 'ESDTRoleNFTAddURI', address, filter.canAddUri);
      }

      if (filter.canTransferRole !== undefined) {
        elasticQuery = this.getRoleCondition(elasticQuery, 'ESDTTransferRole', address, filter.canTransferRole);
      }
    }

    return elasticQuery.withMustMatchCondition('token', filter.collection, QueryOperator.AND)
      .withMustMultiShouldCondition(filter.identifiers, identifier => QueryType.Match('token', identifier, QueryOperator.AND))
      .withSearchWildcardCondition(filter.search, ['token', 'name'])
      .withMustMultiShouldCondition(filter.type, type => QueryType.Match('type', type))
      .withMustMultiShouldCondition([NftType.SemiFungibleESDT, NftType.NonFungibleESDT, NftType.MetaESDT], type => QueryType.Match('type', type));
  }

  private getRoleCondition(query: ElasticQuery, name: string, address: string | undefined, value: string | boolean) {
    const condition = value === false ? QueryConditionOptions.mustNot : QueryConditionOptions.must;
    const targetAddress = typeof value === 'string' ? value : address;

    return query.withCondition(condition, QueryType.Nested('roles', { [`roles.${name}`]: targetAddress }));
  }

  async getNftCollections(pagination: QueryPagination, filter: CollectionFilter): Promise<NftCollection[]> {
    const elasticQuery = this.buildCollectionRolesFilter(filter)
      .withPagination(pagination)
      .withSort([{ name: 'timestamp', order: ElasticSortOrder.descending }]);

    const tokenCollections = await this.elasticService.getList('tokens', 'identifier', elasticQuery);
    const collectionsIdentifiers = tokenCollections.map((collection) => collection.token);

    const indexedCollections: Record<string, any> = {};
    for (const collection of tokenCollections) {
      indexedCollections[collection.token] = collection;
    }

    const nftColections: NftCollection[] = await this.applyPropertiesToCollections(collectionsIdentifiers);

    for (const nftCollection of nftColections) {
      const indexedCollection = indexedCollections[nftCollection.collection];
      if (!indexedCollection) {
        continue;
      }

      nftCollection.type = indexedCollection.type;
      nftCollection.timestamp = indexedCollection.timestamp;
    }

    return nftColections;
  }

  async applyPropertiesToCollections(collectionsIdentifiers: string[]): Promise<NftCollection[]> {
    const nftCollections: NftCollection[] = [];
    const collectionsProperties = await this.batchGetCollectionsProperties(collectionsIdentifiers);
    const collectionsAssets = await this.batchGetCollectionsAssets(collectionsIdentifiers);

    for (const collectionIdentifier of collectionsIdentifiers) {
      const collectionProperties = collectionsProperties[collectionIdentifier];
      if (!collectionProperties) {
        continue;
      }

      const nftCollection = new NftCollection();

      // @ts-ignore
      nftCollection.type = collectionProperties.type;
      nftCollection.name = collectionProperties.name;
      nftCollection.collection = collectionIdentifier.split('-').slice(0, 2).join('-');
      nftCollection.ticker = collectionIdentifier.split('-')[0];
      nftCollection.canFreeze = collectionProperties.canFreeze;
      nftCollection.canWipe = collectionProperties.canWipe;
      nftCollection.canPause = collectionProperties.canPause;
      nftCollection.canTransferNftCreateRole = collectionProperties.canTransferNFTCreateRole;
      nftCollection.owner = collectionProperties.owner;

      if (nftCollection.type === NftType.MetaESDT) {
        nftCollection.decimals = collectionProperties.decimals;
      }

      nftCollection.assets = collectionsAssets[collectionIdentifier];
      nftCollection.ticker = nftCollection.assets ? collectionIdentifier.split('-')[0] : nftCollection.collection;

      nftCollections.push(nftCollection);
    }

    return nftCollections;
  }

  async batchGetCollectionsProperties(collectionsIdentifiers: string[]): Promise<{ [key: string]: TokenProperties | undefined }> {
    const collectionsProperties: { [key: string]: TokenProperties | undefined } = {};
    await this.cachingService.batchApply(
      collectionsIdentifiers,
      collectionIdentifier => CacheInfo.EsdtProperties(collectionIdentifier).key,
      async collectionsIdentifiers => {
        const result: { [key: string]: TokenProperties | undefined } = {};

        for (const collectionIdentifier of collectionsIdentifiers) {
          const collectionProperties = await this.esdtService.getEsdtTokenProperties(collectionIdentifier);
          result[collectionIdentifier] = collectionProperties;
        }

        return RecordUtils.mapKeys(result, identifier => CacheInfo.EsdtProperties(identifier).key);
      },
      (collectionIdentifier, properties) => collectionsProperties[collectionIdentifier] = properties,
      CacheInfo.EsdtProperties('').ttl
    );

    return collectionsProperties;
  }

  async batchGetCollectionsAssets(collectionsIdentifiers: string[]): Promise<{ [key: string]: TokenAssets | undefined }> {
    const collectionsAssets: { [key: string]: TokenAssets | undefined } = {};

    await this.cachingService.batchApply(
      collectionsIdentifiers,
      collectionIdentifier => CacheInfo.EsdtAssets(collectionIdentifier).key,
      async collectionsIdentifiers => {
        const result: { [key: string]: TokenAssets | undefined } = {};

        for (const collectionIdentifier of collectionsIdentifiers) {
          const collectionAssets = await this.tokenAssetService.getAssets(collectionIdentifier);
          result[collectionIdentifier] = collectionAssets;
        }

        return RecordUtils.mapKeys(result, identifier => CacheInfo.EsdtAssets(identifier).key);
      },
      (collectionIdentifier, properties) => collectionsAssets[collectionIdentifier] = properties,
      CacheInfo.EsdtAssets('').ttl
    );

    return collectionsAssets;
  }


  async getNftCollectionCount(filter: CollectionFilter): Promise<number> {
    const elasticQuery = this.buildCollectionRolesFilter(filter);

    return await this.elasticService.getCount('tokens', elasticQuery);
  }

  async getNftCollection(identifier: string): Promise<NftCollection | undefined> {
    const elasticCollection = await this.elasticService.getItem('tokens', '_id', identifier);
    if (!elasticCollection) {
      return undefined;
    }

    const [collection] = await this.applyPropertiesToCollections([identifier]);

    if (!collection) {
      return undefined;
    }

    collection.type = elasticCollection.type;
    collection.timestamp = elasticCollection.timestamp;
    collection.roles = await this.getNftCollectionRoles(elasticCollection);

    return collection;
  }

  async getNftCollectionRoles(elasticCollection: any): Promise<CollectionRoles[]> {
    if (!this.apiConfigService.getIsIndexerV3FlagActive()) {
      return await this.getNftCollectionRolesFromEsdtContract(elasticCollection.token);
    }

    return this.getNftCollectionRolesFromElasticResponse(elasticCollection);
  }

  private getNftCollectionRolesFromElasticResponse(elasticCollection: any): CollectionRoles[] {
    if (!elasticCollection.roles) {
      return [];
    }

    const allRoles: CollectionRoles[] = [];
    for (const role of Object.keys(elasticCollection.roles)) {
      const addresses = elasticCollection.roles[role].distinct();

      for (const address of addresses) {
        const foundAddressRoles = allRoles.find((addressRole) => addressRole.address === address);
        if (foundAddressRoles) {
          TokenUtils.setCollectionRole(foundAddressRoles, role);
          continue;
        }

        const addressRole = new CollectionRoles();
        addressRole.address = address;
        TokenUtils.setCollectionRole(addressRole, role);

        allRoles.push(addressRole);
      }
    }

    return allRoles;
  }

  private async getNftCollectionRolesFromEsdtContract(identifier: string): Promise<CollectionRoles[]> {
    const collectionRolesEncoded = await this.vmQueryService.vmQuery(
      this.apiConfigService.getEsdtContractAddress(),
      'getSpecialRoles',
      undefined,
      [BinaryUtils.stringToHex(identifier)]
    );

    if (!collectionRolesEncoded) {
      return [];
    }

    const allRoles: CollectionRoles[] = [];

    for (const rolesForAddressEncoded of collectionRolesEncoded) {
      const rolesForAddressDecoded = BinaryUtils.base64Decode(rolesForAddressEncoded);
      const components = rolesForAddressDecoded.split(':');

      const roleForAddress = new CollectionRoles();
      roleForAddress.address = components[0];
      const roles = components[1].split(',');
      for (const role of roles) {
        TokenUtils.setCollectionRole(roleForAddress, role);
      }

      allRoles.push(roleForAddress);
    }

    return allRoles;
  }

  async getCollectionForAddressWithRole(address: string, collection: string): Promise<NftCollectionRole | undefined> {
    const filter: CollectionFilter = { collection };

    const collections = await this.esdtAddressService.getCollectionsForAddress(address, filter, { from: 0, size: 1 });
    if (collections.length === 0) {
      return undefined;
    }

    return collections[0];
  }

  async getCollectionsWithRolesForAddress(address: string, filter: CollectionFilter, pagination: QueryPagination): Promise<NftCollectionRole[]> {
    const collections = await this.esdtAddressService.getCollectionsForAddress(address, filter, pagination);

    return collections;
  }

  async getCollectionCountForAddress(address: string, filter: CollectionFilter): Promise<number> {
    const collections = await this.getCollectionsForAddress(address, filter, { from: 0, size: 10000 });

    return collections.length;
  }

  async getCollectionForAddress(address: string, identifier: string): Promise<NftCollectionAccount | undefined> {
    const collections = await this.getCollectionsForAddress(address, { collection: identifier }, { from: 0, size: 1 });

    return collections.find(x => x.collection === identifier);
  }

  async getCollectionsForAddress(address: string, filter: CollectionFilter, pagination: QueryPagination): Promise<NftCollectionAccount[]> {
    const elasticQuery = ElasticQuery.create()
      .withMustExistCondition('identifier')
      .withMustMatchCondition('address', address)
      .withPagination({ from: 0, size: 0 })
      .withMustMatchCondition('token', filter.collection, QueryOperator.AND)
      .withMustMultiShouldCondition(filter.identifiers, identifier => QueryType.Match('token', identifier, QueryOperator.AND))
      .withMustWildcardCondition('token', filter.search)
      .withMustMultiShouldCondition(filter.type, type => QueryType.Match('type', type))
      .withMustMultiShouldCondition([NftType.SemiFungibleESDT, NftType.NonFungibleESDT, NftType.MetaESDT], type => QueryType.Match('type', type))
      .withExtra({
        aggs: {
          collections: {
            composite: {
              size: 10000,
              sources: [
                {
                  collection: {
                    terms: {
                      field: 'token.keyword',
                    },
                  },
                },
              ],
            },
            aggs: {
              balance: {
                sum: {
                  field: 'balanceNum',
                },
              },
            },
          },
        },
      });

    const result = await this.elasticService.post(`${this.apiConfigService.getElasticUrl()}/accountsesdt/_search`, elasticQuery.toJson());

    const buckets = result?.data?.aggregations?.collections?.buckets;

    let data: { collection: string, count: number, balance: number }[] = buckets.map((bucket: any) => ({
      collection: bucket.key.collection,
      count: bucket.doc_count,
      balance: bucket.balance.value,
    }));

    data = data.slice(pagination.from, pagination.from + pagination.size);

    const collections = await this.getNftCollections({ from: 0, size: data.length }, { identifiers: data.map((x: any) => x.collection) });
    const accountCollections = collections.map(collection => ApiUtils.mergeObjects(new NftCollectionAccount(), collection));

    for (const collection of accountCollections) {
      const item = data.find(x => x.collection === collection.collection);
      if (item) {
        collection.count = item.count;
      }
    }

    return accountCollections;
  }

  async getCollectionCountForAddressWithRoles(address: string, filter: CollectionFilter): Promise<number> {
    const count = await this.esdtAddressService.getCollectionCountForAddressFromElastic(address, filter);

    return count;
  }
}

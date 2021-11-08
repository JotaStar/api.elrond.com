import { forwardRef, Module } from "@nestjs/common";
import { CommonModule } from "src/common/common.module";
import { DelegationLegacyModule } from "../delegation.legacy/delegation.legacy.module";
import { NftModule } from "../nfts/nft.module";
import { SmartContractResultModule } from "../sc-results/scresult.module";
import { StakeModule } from "../stake/stake.module";
import { TokenModule } from "../tokens/token.module";
import { TransactionModule } from "../transactions/transaction.module";
import { VmQueryModule } from "../vm.query/vm.query.module";
import { WaitingListModule } from "../waiting-list/waiting.list.module";
import { AccountService } from "./account.service";

@Module({
  imports: [
    forwardRef(() => CommonModule),
    forwardRef(() => VmQueryModule),
    forwardRef(() => TokenModule),
    forwardRef(() => NftModule),
    forwardRef(() => DelegationLegacyModule),
    forwardRef(() => WaitingListModule),
    forwardRef(() => StakeModule),
    forwardRef(() => TransactionModule),
    forwardRef(() => SmartContractResultModule),
  ],
  providers: [
    AccountService,
  ],
  exports: [
    AccountService,
  ]
})
export class AccountModule { }
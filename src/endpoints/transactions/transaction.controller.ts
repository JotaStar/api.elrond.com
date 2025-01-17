import {
  BadRequestException,
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  HttpException,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiExcludeEndpoint, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { QueryConditionOptions } from 'src/common/elastic/entities/query.condition.options';
import { SortOrder } from 'src/common/entities/sort.order';
import { ParseAddressPipe } from 'src/utils/pipes/parse.address.pipe';
import { ParseArrayPipe } from 'src/utils/pipes/parse.array.pipe';
import { ParseBlockHashPipe } from 'src/utils/pipes/parse.block.hash.pipe';
import { ParseOptionalBoolPipe } from 'src/utils/pipes/parse.optional.bool.pipe';
import { ParseOptionalEnumPipe } from 'src/utils/pipes/parse.optional.enum.pipe';
import { ParseOptionalIntPipe } from 'src/utils/pipes/parse.optional.int.pipe';
import { ParseTransactionHashPipe } from 'src/utils/pipes/parse.transaction.hash.pipe';
import { TransactionDecodeDto } from './entities/dtos/transaction.decode.dto';
import { Transaction } from './entities/transaction';
import { TransactionCreate } from './entities/transaction.create';
import { TransactionDetailed } from './entities/transaction.detailed';
import { TransactionSendResult } from './entities/transaction.send.result';
import { TransactionStatus } from './entities/transaction.status';
import { TransactionService } from './transaction.service';

@Controller()
@ApiTags('transactions')
export class TransactionController {
  constructor(private readonly transactionService: TransactionService) { }

  @Get("/transactions")
  @ApiOperation({ summary: 'Transaction list', description: 'Returns a list of transactions available on the blockchain. Maximum size of 50 is allowed when activating flags withScResults, withOperation or withLogs' })
  @ApiOkResponse({ type: [Transaction] })
  @ApiQuery({ name: 'sender', description: 'Address of the transaction sender', required: false })
  @ApiQuery({ name: 'receiver', description: 'Address of the transaction receiver', required: false })
  @ApiQuery({ name: 'token', description: 'Identifier of the token', required: false })
  @ApiQuery({ name: 'senderShard', description: 'Id of the shard the sender address belongs to', required: false })
  @ApiQuery({ name: 'receiverShard', description: 'Id of the shard the receiver address belongs to', required: false })
  @ApiQuery({ name: 'miniBlockHash', description: 'Filter by miniblock hash', required: false })
  @ApiQuery({ name: 'hashes', description: 'Filter by a comma-separated list of transaction hashes', required: false })
  @ApiQuery({ name: 'status', description: 'Status of the transaction (success / pending / invalid / fail)', required: false, enum: TransactionStatus })
  @ApiQuery({ name: 'search', description: 'Search in data object', required: false })
  @ApiQuery({ name: 'function', description: 'Filter transactions by function name', required: false })
  @ApiQuery({ name: 'before', description: 'Before timestamp', required: false })
  @ApiQuery({ name: 'after', description: 'After timestamp', required: false })
  @ApiQuery({ name: 'order', description: 'Sort order (asc/desc)', required: false, enum: SortOrder })
  @ApiQuery({ name: 'from', description: 'Number of items to skip for the result set', required: false })
  @ApiQuery({ name: 'size', description: 'Number of items to retrieve', required: false })
  @ApiQuery({ name: 'condition', description: 'Condition for elastic search queries', required: false, deprecated: true })
  @ApiQuery({ name: 'withScResults', description: 'Return results for transactions', required: false, type: Boolean })
  @ApiQuery({ name: 'withOperations', description: 'Return operations for transactions', required: false, type: Boolean })
  @ApiQuery({ name: 'withLogs', description: 'Return logs for transactions', required: false, type: Boolean })
  getTransactions(
    @Query('from', new DefaultValuePipe(0), ParseIntPipe) from: number,
    @Query('size', new DefaultValuePipe(25), ParseIntPipe) size: number,
    @Query('sender', ParseAddressPipe) sender?: string,
    @Query('receiver', ParseAddressPipe) receiver?: string,
    @Query('token') token?: string,
    @Query('senderShard', ParseOptionalIntPipe) senderShard?: number,
    @Query('receiverShard', ParseOptionalIntPipe) receiverShard?: number,
    @Query('miniBlockHash', ParseBlockHashPipe) miniBlockHash?: string,
    @Query('hashes', ParseArrayPipe) hashes?: string[],
    @Query('status', new ParseOptionalEnumPipe(TransactionStatus)) status?: TransactionStatus,
    @Query('search') search?: string,
    @Query('function') scFunction?: string,
    @Query('condition') condition?: QueryConditionOptions,
    @Query('before', ParseOptionalIntPipe) before?: number,
    @Query('after', ParseOptionalIntPipe) after?: number,
    @Query('order', new ParseOptionalEnumPipe(SortOrder)) order?: SortOrder,
    @Query('withScResults', new ParseOptionalBoolPipe) withScResults?: boolean,
    @Query('withOperations', new ParseOptionalBoolPipe) withOperations?: boolean,
    @Query('withLogs', new ParseOptionalBoolPipe) withLogs?: boolean,
  ): Promise<Transaction[]> {
    if ((withScResults === true || withOperations === true || withLogs) && size > 50) {
      throw new BadRequestException(`Maximum size of 50 is allowed when activating flags 'withScResults', 'withOperations' or 'withLogs'`);
    }

    return this.transactionService.getTransactions({
      sender,
      receiver,
      token,
      function: scFunction,
      senderShard,
      receiverShard,
      miniBlockHash,
      hashes,
      status,
      search,
      before,
      after,
      condition,
      order,
    }, { from, size }, { withScResults, withOperations, withLogs });
  }

  @Get("/transactions/count")
  @ApiOperation({ summary: "Transactions count", description: 'Returns the total number of transactions' })
  @ApiOkResponse({ type: Number })
  @ApiQuery({ name: 'sender', description: 'Address of the transaction sender', required: false })
  @ApiQuery({ name: 'receiver', description: 'Address of the transaction receiver', required: false })
  @ApiQuery({ name: 'token', description: 'Identifier of the token', required: false })
  @ApiQuery({ name: 'senderShard', description: 'Id of the shard the sender address belongs to', required: false })
  @ApiQuery({ name: 'receiverShard', description: 'Id of the shard the receiver address belongs to', required: false })
  @ApiQuery({ name: 'miniBlockHash', description: 'Filter by miniblock hash', required: false })
  @ApiQuery({ name: 'hashes', description: 'Filter by a comma-separated list of transaction hashes', required: false })
  @ApiQuery({ name: 'status', description: 'Status of the transaction (success / pending / invalid / fail)', required: false, enum: TransactionStatus })
  @ApiQuery({ name: 'condition', description: 'Condition for elastic search queries', required: false, deprecated: true })
  @ApiQuery({ name: 'search', description: 'Search in data object', required: false })
  @ApiQuery({ name: 'before', description: 'Before timestamp', required: false })
  @ApiQuery({ name: 'after', description: 'After timestamp', required: false })
  getTransactionCount(
    @Query('sender', ParseAddressPipe) sender?: string,
    @Query('receiver', ParseAddressPipe) receiver?: string,
    @Query('token') token?: string,
    @Query('senderShard', ParseOptionalIntPipe) senderShard?: number,
    @Query('receiverShard', ParseOptionalIntPipe) receiverShard?: number,
    @Query('miniBlockHash', ParseBlockHashPipe) miniBlockHash?: string,
    @Query('hashes', ParseArrayPipe) hashes?: string[],
    @Query('status', new ParseOptionalEnumPipe(TransactionStatus)) status?: TransactionStatus,
    @Query('search') search?: string,
    @Query('condition') condition?: QueryConditionOptions,
    @Query('before', ParseOptionalIntPipe) before?: number,
    @Query('after', ParseOptionalIntPipe) after?: number,
  ): Promise<number> {
    return this.transactionService.getTransactionCount({
      sender,
      receiver,
      token,
      senderShard,
      receiverShard,
      miniBlockHash,
      hashes,
      status,
      search,
      before,
      after,
      condition,
    });
  }

  @Get("/transactions/c")
  @ApiExcludeEndpoint()
  getTransactionCountAlternative(
    @Query('sender', ParseAddressPipe) sender?: string,
    @Query('receiver', ParseAddressPipe) receiver?: string,
    @Query('token') token?: string,
    @Query('senderShard', ParseOptionalIntPipe) senderShard?: number,
    @Query('receiverShard', ParseOptionalIntPipe) receiverShard?: number,
    @Query('miniBlockHash', ParseBlockHashPipe) miniBlockHash?: string,
    @Query('hashes', ParseArrayPipe) hashes?: string[],
    @Query('status', new ParseOptionalEnumPipe(TransactionStatus)) status?: TransactionStatus,
    @Query('search') search?: string,
    @Query('condition') condition?: QueryConditionOptions,
    @Query('before', ParseOptionalIntPipe) before?: number,
    @Query('after', ParseOptionalIntPipe) after?: number,
  ): Promise<number> {
    return this.transactionService.getTransactionCount({
      sender,
      receiver,
      token,
      senderShard,
      receiverShard,
      miniBlockHash,
      hashes,
      status,
      search,
      before,
      after,
      condition,
    });
  }

  @Get('/transactions/:txHash')
  @ApiOperation({ summary: 'Transaction details', description: 'Return transaction details for a given transaction hash' })
  @ApiOkResponse({ type: TransactionDetailed })
  @ApiNotFoundResponse({ description: 'Transaction not found' })
  @ApiQuery({ name: 'fields', description: 'List of fields to filter by', required: false })
  async getTransaction(
    @Param('txHash', ParseTransactionHashPipe) txHash: string,
    @Query('fields', ParseArrayPipe) fields?: string[],
  ): Promise<TransactionDetailed> {
    const transaction = await this.transactionService.getTransaction(txHash, fields);
    if (transaction === null) {
      throw new HttpException('Transaction not found', HttpStatus.NOT_FOUND);
    }

    return transaction;
  }

  @Post('/transactions')
  @ApiOperation({ summary: 'Send transaction', description: 'Posts a signed transaction on the blockchain' })
  @ApiCreatedResponse({ type: TransactionSendResult })
  async createTransaction(@Body() transaction: TransactionCreate): Promise<TransactionSendResult> {
    if (!transaction.sender) {
      throw new BadRequestException('Sender must be provided');
    }

    if (!transaction.receiver) {
      throw new BadRequestException('Receiver must be provided');
    }

    if (!transaction.signature) {
      throw new BadRequestException('Signature must be provided');
    }

    const result = await this.transactionService.createTransaction(transaction);

    if (typeof result === 'string' || result instanceof String) {
      throw new HttpException(result, HttpStatus.BAD_REQUEST);
    }

    return result;
  }

  @Post('/transactions/decode')
  @ApiOperation({ summary: 'Decode transaction', description: 'Decodes transaction action, given a minimum set of transaction details' })
  @ApiCreatedResponse({ type: TransactionDecodeDto })
  async decodeTransaction(@Body() transaction: TransactionDecodeDto): Promise<TransactionDecodeDto> {
    if (!transaction.sender) {
      throw new BadRequestException('Sender must be provided');
    }

    if (!transaction.receiver) {
      throw new BadRequestException('Receiver must be provided');
    }

    return await this.transactionService.decodeTransaction(transaction);
  }
}

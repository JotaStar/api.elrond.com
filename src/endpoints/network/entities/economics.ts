import { ApiProperty } from "@nestjs/swagger";

export class Economics {
  @ApiProperty()
  totalSupply: number = 0;

  @ApiProperty()
  circulatingSupply: number = 0;

  @ApiProperty()
  staked: number = 0;

  @ApiProperty({ type: Number })
  price: number | undefined = undefined;

  @ApiProperty({ type: Number })
  marketCap: number | undefined = undefined;

  @ApiProperty()
  apr: number = 0;

  @ApiProperty()
  topUpApr: number = 0;

  @ApiProperty()
  baseApr: number = 0;
}

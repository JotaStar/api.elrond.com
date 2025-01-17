import { ApiProperty } from "@nestjs/swagger";

export class Tag {
  @ApiProperty({ type: String, nullable: true, example: 'sunny' })
  tag: string = '';

  @ApiProperty({ type: Number, nullable: true, example: 46135 })
  count: number | undefined = undefined;
}

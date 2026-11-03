import { Module } from "@nestjs/common";

import { GlobalModule } from "../global/global.module";
import { TtsController } from "./tts.controller";
import { TtsService } from "./tts.service";

@Module({
  imports: [GlobalModule],
  controllers: [TtsController],
  providers: [TtsService],
  exports: [TtsService],
})
export class TtsModule {}

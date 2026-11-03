import { Body, Controller, Get, Post, Query, Res, UseGuards } from "@nestjs/common";
import { Response } from "express";

import { AuthGuard, UncheckAuth } from "../guards/auth.guard";
import { TtsService } from "./tts.service";

/** 可供选择的英文神经语音（前端设置页用） */
export const TTS_VOICES = [
  { id: "en-US-JennyNeural", label: "Jenny · 美音女声", note: "温和耐听，当前默认" },
  { id: "en-US-AvaNeural", label: "Ava · 美音女声", note: "最自然、最亲切" },
  { id: "en-US-EmmaNeural", label: "Emma · 美音女声", note: "清晰明亮，适合教学" },
  { id: "en-US-AriaNeural", label: "Aria · 美音女声", note: "播报感强，字正腔圆" },
  { id: "en-US-AndrewNeural", label: "Andrew · 美音男声", note: "温暖自然，最像真人" },
  { id: "en-US-BrianNeural", label: "Brian · 美音男声", note: "沉稳，教材录音感" },
  { id: "en-US-GuyNeural", label: "Guy · 美音男声", note: "标准美式，语速平稳" },
  { id: "en-GB-SoniaNeural", label: "Sonia · 英音女声", note: "英式标准音，吐字清楚" },
  { id: "en-GB-RyanNeural", label: "Ryan · 英音男声", note: "英式播音腔" },
];

@Controller("tts")
export class TtsController {
  constructor(private readonly ttsService: TtsService) {}

  /**
   * 播放接口：把文本合成成 mp3 返回。
   * <audio> 标签不会带 Authorization，所以这里不强制登录。
   */
  @UncheckAuth()
  @UseGuards(AuthGuard)
  @Get("speak")
  async speak(
    @Query("text") text: string,
    @Query("voice") voice: string,
    @Query("rate") rate: string,
    @Res() res: Response,
  ) {
    const buffer = await this.ttsService.getAudio({ text, voice, rate });
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", String(buffer.byteLength));
    // 同一段文本永远产出同一个文件，可以放心强缓存
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.end(buffer);
  }

  @UncheckAuth()
  @UseGuards(AuthGuard)
  @Get("voices")
  voices() {
    return {
      current: this.ttsService.voice,
      rate: this.ttsService.rate,
      enabled: this.ttsService.isEnabled(),
      voices: TTS_VOICES,
    };
  }

  /** 全库预生成：把数据库里所有句子离线合成到缓存目录 */
  @UncheckAuth()
  @UseGuards(AuthGuard)
  @Post("prewarm")
  async prewarm(@Body() body: { voice?: string; rate?: string }) {
    return this.ttsService.startPrewarm({ voice: body?.voice, rate: body?.rate });
  }

  @UncheckAuth()
  @UseGuards(AuthGuard)
  @Get("prewarm/status")
  prewarmStatus() {
    return this.ttsService.prewarmStatus();
  }

  /** 清理半截文件 */
  @UncheckAuth()
  @UseGuards(AuthGuard)
  @Post("cache/purge")
  async purge() {
    return { removed: await this.ttsService.purgeBrokenCache() };
  }
}

import { Module } from "@nestjs/common";

import { CourseHistoryModule } from "../course-history/course-history.module";
import { CourseModule } from "../course/course.module";
import { MembershipModule } from "../membership/membership.module";
import { TtsModule } from "../tts/tts.module";
import { CoursePackImportService } from "./course-pack-import.service";
import { CoursePackController } from "./course-pack.controller";
import { CoursePackService } from "./course-pack.service";

@Module({
  imports: [CourseModule, MembershipModule, CourseHistoryModule, TtsModule],
  providers: [CoursePackService, CoursePackImportService],
  controllers: [CoursePackController],
})
export class CoursePackModule {}

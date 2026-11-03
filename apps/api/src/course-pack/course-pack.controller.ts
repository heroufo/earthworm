import { Body, Controller, Delete, Get, Param, Post, UseGuards } from "@nestjs/common";

import { AuthGuard, UncheckAuth } from "../guards/auth.guard";
import { User, UserEntity } from "../user/user.decorators";
import { CoursePackImportService } from "./course-pack-import.service";
import { CoursePackService } from "./course-pack.service";

@Controller("course-pack")
export class CoursePackController {
  constructor(
    private readonly coursePackService: CoursePackService,
    private readonly coursePackImportService: CoursePackImportService,
  ) {}

  /** 新建空课程包（先建包，之后分几批把课程导进来） */
  @UseGuards(AuthGuard)
  @Post()
  create(@User() user: UserEntity, @Body() body: { title?: string; description?: string }) {
    return this.coursePackService.create(user.userId, {
      title: body?.title,
      description: body?.description,
    });
  }

  /** 导入前预览：这份 CSV 里有几个包、几节课、各多少句（不写库） */
  @UseGuards(AuthGuard)
  @Post("preview")
  preview(@Body() body: { csvText?: string }) {
    return this.coursePackImportService.preview(body?.csvText ?? "");
  }

  /** 网页端 CSV 导入课程包：前端读完文件后把文本 POST 上来 */
  @UseGuards(AuthGuard)
  @Post("import")
  importFromCsv(
    @User() user: UserEntity,
    @Body()
    body: {
      csvText?: string;
      replace?: boolean;
      targetCoursePackId?: string;
      courseTitles?: string[];
    },
  ) {
    return this.coursePackImportService.importFromCsv(user.userId, body?.csvText ?? "", {
      replace: body?.replace === true,
      targetCoursePackId: body?.targetCoursePackId || undefined,
      courseTitles: Array.isArray(body?.courseTitles) ? body.courseTitles : undefined,
    });
  }

  @UncheckAuth()
  @UseGuards(AuthGuard)
  @Get()
  async findAll(@User() user: UserEntity) {
    return await this.coursePackService.findAll(user.userId);
  }

  @UncheckAuth()
  @UseGuards(AuthGuard)
  @Get(":coursePackId")
  async findOne(@User() user: UserEntity, @Param("coursePackId") coursePackId: string) {
    return await this.coursePackService.findOneWithCourses(user.userId, coursePackId);
  }

  @UncheckAuth()
  @UseGuards(AuthGuard)
  @Get(":coursePackId/courses/:courseId")
  findCourse(
    @User() user: UserEntity,
    @Param("coursePackId") coursePackId: string,
    @Param("courseId") courseId: string,
  ) {
    return this.coursePackService.findCourse(user.userId, coursePackId, courseId);
  }

  @UncheckAuth()
  @UseGuards(AuthGuard)
  @Get(":coursePackId/courses/:courseId/next")
  findNextCourse(@Param("coursePackId") coursePackId: string, @Param("courseId") courseId: string) {
    return this.coursePackService.findNextCourse(coursePackId, courseId);
  }

  @UseGuards(AuthGuard)
  @Post(":coursePackId/courses/:courseId/complete")
  CompleteCourse(
    @User() user: UserEntity,
    @Param("coursePackId") coursePackId: string,
    @Param("courseId") courseId: string,
  ) {
    return this.coursePackService.completeCourse(user.userId, coursePackId, courseId);
  }

  /** 删除课程包（连带课程、句子与学习记录） */
  @UseGuards(AuthGuard)
  @Delete(":coursePackId")
  remove(@User() user: UserEntity, @Param("coursePackId") coursePackId: string) {
    return this.coursePackService.remove(user.userId, coursePackId);
  }
}

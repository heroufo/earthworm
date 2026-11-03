import * as fs from "node:fs";
import * as path from "node:path";

import { HttpException, Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";

import { course, coursePack } from "@earthworm/schema";
import { DB, DbType } from "../global/providers/db.provider";
import { LogtoService } from "../logto/logto.service";
import { MembershipService } from "../membership/membership.service";
import { type MembershipDetails } from "../membership/types/membership.types";
import { UserCourseProgressService } from "../user-course-progress/user-course-progress.service";
import { UserEntity } from "../user/user.decorators";
import { UpdateUserDto } from "./model/user.dto";

/**
 * 本地部署模式（Local Mode）
 * ------------------------------------------------------------
 * 原版把用户资料（用户名、头像）存在 Logto 里，通过 Logto M2M API 读写。
 * 本地部署没有 Logto，这里改成一个本地 JSON 文件持久化，接口形状保持不变，
 * 因此前端和其它模块无需改动。
 */
const LOCAL_MODE = process.env.LOCAL_MODE !== "false";
const LOCAL_PROFILE_FILE = path.join(process.cwd(), ".local-profile.json");

const DEFAULT_PROFILE = {
  id: "local-user",
  sub: "local-user",
  username: "本地学习者",
  name: "本地学习者",
  picture: "",
  avatar: "",
  email: "local@earthworm.local",
};

type LocalProfile = typeof DEFAULT_PROFILE;

function readProfile(): LocalProfile {
  try {
    if (fs.existsSync(LOCAL_PROFILE_FILE)) {
      const raw = JSON.parse(fs.readFileSync(LOCAL_PROFILE_FILE, "utf-8"));
      return { ...DEFAULT_PROFILE, ...raw };
    }
  } catch {
    // 文件损坏时回退到默认值
  }
  return { ...DEFAULT_PROFILE };
}

function writeProfile(profile: LocalProfile) {
  try {
    fs.writeFileSync(LOCAL_PROFILE_FILE, JSON.stringify(profile, null, 2), "utf-8");
  } catch (error) {
    console.error("写入本地用户资料失败:", error);
  }
}

@Injectable()
export class UserService {
  constructor(
    @Inject(DB) private db: DbType,
    private readonly logtoService: LogtoService,
    private readonly userCourseProgressService: UserCourseProgressService,
    private readonly membershipService: MembershipService,
  ) {}

  async findUser(uId: string) {
    try {
      if (LOCAL_MODE) {
        const profile = readProfile();
        const membershipInfo = await this.getMembershipInfo(uId);
        return { ...profile, id: uId, sub: uId, membership: membershipInfo };
      }

      const { data: logtoUserInfo } = await this.logtoService.logtoApi.get(`/api/users/${uId}`);
      const membershipInfo = await this.getMembershipInfo(uId);
      return {
        ...logtoUserInfo,
        membership: membershipInfo,
      };
    } catch (error) {
      console.error("Error fetching user info:", error);
      return undefined;
    }
  }

  /**
   * 返回当前登录用户的信息
   * logto 相关的信息是在 client 获取得
   * 所以这里只需要返回 earthworm 服务相关的信息就可以了(比如是否为会员)
   * @param uId
   * @returns
   */
  async findCurrentUser(uId: string) {
    try {
      return {
        membership: await this.getMembershipInfo(uId),
      };
    } catch (error) {
      console.error("Error fetching current user info:", error);
      return undefined;
    }
  }

  private async getMembershipInfo(uId: string) {
    const isMember = await this.membershipService.isMember(uId);
    let details: MembershipDetails = null;
    if (isMember) {
      details = await this.membershipService.getMembershipDetails(uId);
    }
    return { isMember, details };
  }

  async updateUser(user: UserEntity, dto: UpdateUserDto) {
    if (LOCAL_MODE) {
      const profile = readProfile();
      if (dto.username !== undefined) {
        profile.username = dto.username;
        profile.name = dto.username;
      }
      if (dto.avatar !== undefined) {
        profile.avatar = dto.avatar;
        profile.picture = dto.avatar;
      }
      writeProfile(profile);
      return { data: { ...profile, id: user.userId, sub: user.userId } };
    }

    try {
      const { data } = await this.logtoService.logtoApi.patch(`/api/users/${user.userId}`, dto);
      return { data };
    } catch (e) {
      throw new HttpException(e.response.data.message, e.response.status);
    }
  }

  async setupNewUser(user: UserEntity, dto: { username: string; avatar: string }) {
    if (!dto.avatar) {
      dto.avatar = this.getAvatarUrl();
    }

    await this.updateUser(user, { username: dto.username, avatar: dto.avatar });

    const { id, courses } = await this.db.query.coursePack.findFirst({
      where: eq(coursePack.order, 1),
      with: {
        courses: {
          where: eq(course.order, 1),
        },
      },
    });

    await this.userCourseProgressService.upsert(user.userId, id, courses.at(0).id, 0);
    return {
      avatar: dto.avatar,
      username: dto.username,
    };
  }

  private getAvatarUrl() {
    const order = this.getRandomNumber();

    return `https://earthworm-prod-1312884695.cos.ap-beijing.myqcloud.com/avatars/avatar${order}.png`;
  }

  private getRandomNumber() {
    return Math.floor(Math.random() * 9) + 1;
  }
}

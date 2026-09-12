import { Transform, Type } from 'class-transformer';
import {
  Equals,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { GENDER_FILTER_VALUES } from '../types/gender-filter.enum';
import type { GenderFilter } from '../types/gender-filter.enum';

/** Swift's `UUID.uuidString` always renders uppercase, while this server's
 * `crypto.randomUUID()` (and the session-map keys built from it) are always
 * lowercase. Without normalizing, a session id round-tripped through an iOS
 * client compares as a different string from the one the session was
 * created with — every relay/leave for that session fails with
 * SESSION_NOT_FOUND the instant it comes back. UUIDs are case-insensitive
 * per RFC 4122, so lowercasing on the way in is a correctness fix, not a
 * workaround. */
const LowercaseSessionId = Transform(({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.toLowerCase() : value,
);

export class UserProfileDto {
  @IsString()
  @Length(1, 100)
  id!: string;

  @IsString()
  @Length(1, 60)
  username!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  avatarURL!: string | null;
}

export class IceCandidatePayloadDto {
  @IsString()
  @MaxLength(4000)
  candidate!: string;

  @IsOptional()
  sdpMid!: string | null;

  @IsOptional()
  sdpMLineIndex!: number | null;

  @IsOptional()
  @IsString()
  usernameFragment?: string | null;
}

export class FindMessageDto {
  @Equals('find')
  type!: 'find';

  @IsString()
  @Length(1, 100)
  requestId!: string;

  @IsIn(GENDER_FILTER_VALUES)
  genderFilter!: GenderFilter;

  @ValidateNested()
  @Type(() => UserProfileDto)
  profile!: UserProfileDto;
}

export class CancelFindMessageDto {
  @Equals('cancel-find')
  type!: 'cancel-find';

  @IsString()
  @Length(1, 100)
  requestId!: string;
}

export class OfferMessageDto {
  @Equals('offer')
  type!: 'offer';

  @LowercaseSessionId
  @IsUUID()
  sessionId!: string;

  @IsString()
  @MaxLength(20000)
  sdp!: string;
}

export class AnswerMessageDto {
  @Equals('answer')
  type!: 'answer';

  @LowercaseSessionId
  @IsUUID()
  sessionId!: string;

  @IsString()
  @MaxLength(20000)
  sdp!: string;
}

export class IceCandidateMessageDto {
  @Equals('ice-candidate')
  type!: 'ice-candidate';

  @LowercaseSessionId
  @IsUUID()
  sessionId!: string;

  @ValidateNested()
  @Type(() => IceCandidatePayloadDto)
  candidate!: IceCandidatePayloadDto;
}

export class LeaveMessageDto {
  @Equals('leave')
  type!: 'leave';

  @LowercaseSessionId
  @IsUUID()
  sessionId!: string;

  @IsOptional()
  @IsInt()
  larpsGiven?: number;

  @IsOptional()
  @IsIn(['user-ended', 'cancelled'])
  reason?: string;
}

export class PingMessageDto {
  @Equals('ping')
  type!: 'ping';

  @IsNumber()
  ts!: number;
}

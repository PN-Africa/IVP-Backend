import { IsString, IsOptional, IsEnum, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export enum JobType {
  FULL_TIME = 'FULL_TIME',
  REMOTE = 'REMOTE',
  GIG = 'GIG',
  CONTRACT = 'CONTRACT',
}

export class SearchJobsDto {
  @ApiPropertyOptional({ example: 'developer', description: 'Searches within job title or description' })
  @IsOptional()
  @IsString()
  keyword?: string; 

  @ApiPropertyOptional({ enum: JobType, description: 'Filter by job type' })
  @IsOptional()
  @IsEnum(JobType)
  jobType?: JobType;

  @ApiPropertyOptional({ example: 'Lagos', description: 'Filter by location' })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({ example: 'Fintech', description: 'Filter by industry' })
  @IsOptional()
  @IsString()
  industry?: string;

  @ApiPropertyOptional({ example: 'Senior', description: 'Filter by experience level' })
  @IsOptional()
  @IsString()
  experienceLevel?: string;

  @ApiPropertyOptional({ enum: ['createdAt', 'salary', 'deadline'], description: 'Field to sort results by' })
  @IsOptional()
  @IsIn(['createdAt', 'salary', 'deadline'])
  sortBy?: 'createdAt' | 'salary' | 'deadline';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], example: 'desc', description: 'Sort direction' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 10, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;
}
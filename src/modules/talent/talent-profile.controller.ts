import {
  Controller,
  Put,
  Post,
  Body,
  UseGuards,
  Request,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { 
  ApiTags, 
  ApiOperation, 
  ApiBearerAuth, 
  ApiOkResponse, 
  ApiCreatedResponse,
  ApiUnauthorizedResponse,
  ApiConsumes
} from '@nestjs/swagger';
import type { Express } from 'express';
import { TalentProfileService } from './talent-profile.service';
import {
  UpdatePersonalInfoDto,
  AddExperienceDto,
  AddEducationDto,
  UpdateSkillsDto,
  UpdateEmploymentPreferenceDto 
} from './dto/talent-profile.dto';

@ApiTags('Talent Profile')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('talent/profile')
export class TalentProfileController {
  constructor(private readonly talentProfileService: TalentProfileService) {}

  @Put('personal')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('profileImage'))
  @ApiOperation({ summary: 'Update personal info including profile image upload' })
  @ApiOkResponse({ description: 'Personal information successfully updated.' })
  async updatePersonalInfo(
    @Request() req, 
    @Body() dto: UpdatePersonalInfoDto,
    @UploadedFile() file?: Express.Multer.File
  ) {
    return this.talentProfileService.updatePersonalInfo(req.user.id, dto, file);
  }

  @Post('experience')
  @ApiOperation({ summary: 'Add a new work experience entry' })
  @ApiCreatedResponse({ description: 'Work experience entry added successfully.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  async addExperience(@Request() req, @Body() dto: AddExperienceDto) {
    return this.talentProfileService.addExperience(req.user.id, dto);
  }

  @Post('education')
  @ApiOperation({ summary: 'Add a new education entry' })
  @ApiCreatedResponse({ description: 'Education entry added successfully.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  async addEducation(@Request() req, @Body() dto: AddEducationDto) {
    return this.talentProfileService.addEducation(req.user.id, dto);
  }

  @Put('skills')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('resume'))
  @ApiOperation({ summary: 'Update skills, portfolio, and upload resume' })
  @ApiOkResponse({ description: 'Skills and resume successfully updated.' })
  async updateSkills(
    @Request() req, 
    @Body() dto: UpdateSkillsDto,
    @UploadedFile() file?: Express.Multer.File
  ) {
    return this.talentProfileService.updateSkills(req.user.id, dto, file);
  }

  // Added Endpoint for Employment Preferences
  @Put('employment-preferences')
  @ApiOperation({ summary: 'Update employment preferences (Job Type, Location, Salary, Availability)' })
  @ApiOkResponse({ description: 'Employment preferences successfully updated.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  async updateEmploymentPreferences(@Request() req, @Body() dto: UpdateEmploymentPreferenceDto) {
    return this.talentProfileService.updateEmploymentPreferences(req.user.id, dto);
  }
}
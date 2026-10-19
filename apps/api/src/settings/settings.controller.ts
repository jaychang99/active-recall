import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SettingsService } from './settings.service';
import { UpdateSettingsDto } from './settings.dto';

@ApiTags('settings')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}
  @Get() get() {
    return this.settings.get();
  }
  @Patch() update(@Body() dto: UpdateSettingsDto) {
    return this.settings.update(dto);
  }
}

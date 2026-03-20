import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
  @Get('ping')
  ping() {
    return { status: 'Backend de Petho esta ONLINE!', timestamp: new Date().toISOString() };
  }

  @Get('ping-auth')
  @UseGuards(JwtAuthGuard)
  pingAuth(@Req() req: any) {
    return { status: 'El token funciona perfectamente!', user: req.user };
  }
}

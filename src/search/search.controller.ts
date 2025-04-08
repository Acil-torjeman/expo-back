// src/search/search.controller.ts
import { Controller, Get, Query, UseGuards, Logger } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserService } from '../user/user.service';

@Controller('search')
export class SearchController {
  private readonly logger = new Logger(SearchController.name);

  constructor(
    private readonly userService: UserService,
    // Injecter d'autres services au besoin (EventService, etc.)
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async search(@Query('query') query: string) {
    this.logger.log(`Global search for: ${query}`);
    
    // Utiliser undefined au lieu de null pour les paramètres optionnels
    const users = await this.userService.findAll(query, undefined, undefined, undefined, undefined, false);
    
    // Structure résultat pour la recherche globale
    return [
      ...users.slice(0, 5).map(user => ({
        ...user.toJSON(),
        type: 'user'
      })),
      // Ajouter d'autres types de résultats ici au besoin...
    ];
  }
}
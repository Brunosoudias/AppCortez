import { Module } from '@nestjs/common';
import { ProcessingModule } from '../processing/processing.module';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { JsonProjectRepository } from './repositories/json-project.repository';
import { PROJECT_REPOSITORY } from './tokens/project-repository.token';

@Module({
  imports: [ProcessingModule],
  controllers: [ProjectsController],
  providers: [
    ProjectsService,
    // Troca futura para banco de dados: substitua "useClass" por uma
    // implementação PrismaProjectRepository, sem mexer em mais nada.
    { provide: PROJECT_REPOSITORY, useClass: JsonProjectRepository },
  ],
  exports: [ProjectsService],
})
export class ProjectsModule {}

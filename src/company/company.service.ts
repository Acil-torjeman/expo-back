// src/company/company.service.ts
import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';
import { Company } from './entities/company.entity';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';

@Injectable()
export class CompanyService {
  private readonly logger = new Logger(CompanyService.name);

  constructor(
    @InjectModel(Company.name) private companyModel: Model<Company>,
  ) {}

  /**
   * Créer une nouvelle entreprise
   */
  async create(createCompanyDto: CreateCompanyDto): Promise<Company> {
    this.logger.log(`Creating new company: ${createCompanyDto.companyName}`);
    const company = new this.companyModel(createCompanyDto);
    return company.save();
  }

  /**
   * Trouver toutes les entreprises
   */
  async findAll(): Promise<Company[]> {
    this.logger.log('Finding all companies');
    return this.companyModel.find().exec();
  }

  /**
   * Trouver une entreprise par ID
   */
  async findOne(id: string): Promise<Company> {
    this.logger.log(`Finding company with ID: ${id}`);
    const company = await this.companyModel.findById(id).exec();
    
    if (!company) {
      this.logger.warn(`Company with ID ${id} not found`);
      throw new NotFoundException(`Company with ID ${id} not found`);
    }
    
    return company;
  }

  /**
   * Rechercher des entreprises par critères
   */
  async search(criteria: Partial<Company>): Promise<Company[]> {
    this.logger.log(`Searching companies with criteria: ${JSON.stringify(criteria)}`);
    return this.companyModel.find(criteria as FilterQuery<Company>).exec();
  }

  /**
   * Mettre à jour une entreprise
   */
  async update(id: string, updateCompanyDto: UpdateCompanyDto): Promise<Company> {
    this.logger.log(`Updating company with ID: ${id}`);
    const existingCompany = await this.companyModel.findByIdAndUpdate(
      id,
      { $set: updateCompanyDto },
      { new: true },
    ).exec();
    
    if (!existingCompany) {
      this.logger.warn(`Company with ID ${id} not found for update`);
      throw new NotFoundException(`Company with ID ${id} not found`);
    }
    
    return existingCompany;
  }

  /**
   * Supprimer une entreprise
   */
  async remove(id: string): Promise<Company> {
    this.logger.log(`Removing company with ID: ${id}`);
    const deletedCompany = await this.companyModel.findByIdAndDelete(id).exec();
    
    if (!deletedCompany) {
      this.logger.warn(`Company with ID ${id} not found for deletion`);
      throw new NotFoundException(`Company with ID ${id} not found`);
    }
    
    return deletedCompany;
  }
}
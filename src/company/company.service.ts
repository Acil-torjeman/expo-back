// src/company/company.service.ts
import { Injectable, NotFoundException, Logger, InternalServerErrorException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
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
 * Update a company with improved error handling and logging
 */
async update(id: string, updateCompanyDto: UpdateCompanyDto): Promise<Company> {
  try {
    this.logger.log(`Updating company with ID: ${id} with data: ${JSON.stringify(updateCompanyDto)}`);
    
    // Convert ID string to MongoDB ObjectId
    const objectId = new Types.ObjectId(id);
    
    // Log the actual update operation
    this.logger.log(`Executing MongoDB findByIdAndUpdate on: ${objectId}, with $set operation`);
    
    const existingCompany = await this.companyModel.findByIdAndUpdate(
      objectId,
      { $set: updateCompanyDto },
      { new: true },
    ).exec();
    
    if (!existingCompany) {
      this.logger.warn(`Company with ID ${id} not found for update`);
      throw new NotFoundException(`Company with ID ${id} not found`);
    }
    
    this.logger.log(`Successfully updated company: ${existingCompany._id}, updated fields: ${Object.keys(updateCompanyDto).join(', ')}`);
    
    return existingCompany;
  } catch (error) {
    if (error instanceof NotFoundException) {
      throw error;
    }
    
    this.logger.error(`Error updating company ${id}: ${error.message}`, error.stack);
    
    if (error.name === 'CastError') {
      throw new BadRequestException(`Invalid company ID format: ${id}`);
    }
    
    throw new InternalServerErrorException(`Failed to update company: ${error.message}`);
  }
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
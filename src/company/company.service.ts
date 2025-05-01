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
      
      // Ensure valid data
      if (!id || !updateCompanyDto) {
        throw new BadRequestException('Invalid company update data');
      }
      
      // Direct MongoDB approach to ensure update occurs
      const result = await this.companyModel.updateOne(
        { _id: new Types.ObjectId(id) },
        { $set: updateCompanyDto }
      );
      
      this.logger.log(`Update result: ${JSON.stringify(result)}`);
      
      if (result.matchedCount === 0) {
        throw new NotFoundException(`Company with ID ${id} not found`);
      }
      
      if (result.modifiedCount === 0 && result.matchedCount > 0) {
        this.logger.warn(`Company found but no changes made. ID: ${id}`);
      }
      
      // Fetch and return the updated company
      const updatedCompany = await this.companyModel.findById(id).exec();
      if (!updatedCompany) {
        throw new NotFoundException(`Updated company with ID ${id} not found`);
      }
      return updatedCompany;
    } catch (error) {
      this.logger.error(`Error updating company ${id}: ${error.message}`, error.stack);
      
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      
      if (error.name === 'CastError') {
        throw new BadRequestException(`Invalid company ID format: ${id}`);
      }
      
      throw new InternalServerErrorException(`Failed to update company: ${error.message}`);
    }
  }
 /**
 * Update company logo path
 * @param id Company ID
 * @param logoPath New logo file path
 */
async updateLogo(id: string, logoPath: string): Promise<Company> {
  this.logger.log(`Updating logo for company ${id} to ${logoPath}`);
  
  try {
    // Convert string ID to ObjectId
    const objectId = new Types.ObjectId(id);
    
    // Update the company logo path
    const updateResult = await this.companyModel.updateOne(
      { _id: objectId },
      { $set: { companyLogoPath: logoPath } }
    );
    
    if (updateResult.matchedCount === 0) {
      throw new NotFoundException(`Company with ID ${id} not found`);
    }
    
    // Fetch and return the updated company
    const updatedCompany = await this.companyModel.findById(id);
    
    if (!updatedCompany) {
      throw new NotFoundException(`Company with ID ${id} not found after update`);
    }
    
    return updatedCompany;
  } catch (error) {
    this.logger.error(`Error updating company logo: ${error.message}`);
    
    if (error instanceof NotFoundException) {
      throw error;
    }
    
    if (error.name === 'CastError') {
      throw new BadRequestException(`Invalid company ID format: ${id}`);
    }
    
    throw new InternalServerErrorException(`Failed to update company logo: ${error.message}`);
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
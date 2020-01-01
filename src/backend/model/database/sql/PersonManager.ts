import {IPersonManager} from '../interfaces/IPersonManager';
import {SQLConnection} from './SQLConnection';
import {PersonEntry} from './enitites/PersonEntry';
import {PhotoDTO} from '../../../../common/entities/PhotoDTO';
import {MediaEntity} from './enitites/MediaEntity';
import {FaceRegionEntry} from './enitites/FaceRegionEntry';
import {PersonDTO} from '../../../../common/entities/PersonDTO';
import {Utils} from '../../../../common/Utils';
import {SelectQueryBuilder} from 'typeorm';

const LOG_TAG = '[PersonManager]';

export class PersonManager implements IPersonManager {
  samplePhotos: { [key: string]: PhotoDTO } = {};
  persons: PersonEntry[] = [];

  async updatePerson(name: string, partialPerson: PersonDTO): Promise<PersonEntry> {
    const connection = await SQLConnection.getConnection();
    const repository = connection.getRepository(PersonEntry);
    const person = await repository.createQueryBuilder('person')
      .limit(1)
      .where('person.name LIKE :name COLLATE utf8_general_ci', {name: name}).getOne();


    if (typeof partialPerson.name !== 'undefined') {
      person.name = partialPerson.name;
    }
    if (typeof partialPerson.isFavourite !== 'undefined') {
      person.isFavourite = partialPerson.isFavourite;
    }
    await repository.save(person);

    await this.loadAll();

    return person;
  }

  async getSamplePhoto(name: string): Promise<PhotoDTO> {
    return (await this.getSamplePhotos([name]))[name];
  }


  async getSamplePhotos(names: string[]): Promise<{ [key: string]: PhotoDTO }> {
    const hasAll = names.reduce((prev, name) => prev && !!this.samplePhotos[name], true);
    if (!hasAll) {
      const connection = await SQLConnection.getConnection();
      const rawAndEntities = await (connection
        .getRepository(MediaEntity)
        .createQueryBuilder('media') as SelectQueryBuilder<MediaEntity>)
        .select(['media.name', 'media.id', 'person.name', 'directory.name',
          'directory.path', 'media.metadata.size.width', 'media.metadata.size.height'])
        .leftJoin('media.directory', 'directory')
        .leftJoinAndSelect('media.metadata.faces', 'faces')
        .leftJoin('faces.person', 'person')
        .groupBy('person.name')
        .orWhere(`person.name IN (:...names) COLLATE utf8_general_ci`, {names: names}).getRawAndEntities();


      for (let i = 0; i < rawAndEntities.raw.length; ++i) {
        this.samplePhotos[rawAndEntities.raw[i].person_name] =
          Utils.clone(rawAndEntities.entities.find(m => m.name === rawAndEntities.raw[i].media_name));
        this.samplePhotos[rawAndEntities.raw[i].person_name].metadata.faces = [FaceRegionEntry.fromRawToDTO(rawAndEntities.raw[i])];
      }
    }

    const photoMap: { [key: string]: PhotoDTO } = {};
    names.forEach(n => photoMap[n] = this.samplePhotos[n]);
    return photoMap;
  }


  async loadAll(): Promise<void> {
    const connection = await SQLConnection.getConnection();
    const personRepository = connection.getRepository(PersonEntry);
    this.persons = await personRepository.find();

  }

  async getAll(): Promise<PersonEntry[]> {
    await this.loadAll();
    return this.persons;
  }


  async get(name: string): Promise<PersonEntry> {

    let person = this.persons.find(p => p.name === name);
    if (!person) {
      const connection = await SQLConnection.getConnection();
      const personRepository = connection.getRepository(PersonEntry);
      person = await personRepository.findOne({name: name});
      if (!person) {
        person = await personRepository.save(<PersonEntry>{name: name});
      }
      this.persons.push(person);
    }
    return person;
  }


  async saveAll(names: string[]): Promise<void> {
    const toSave: { name: string }[] = [];
    const connection = await SQLConnection.getConnection();
    const personRepository = connection.getRepository(PersonEntry);
    await this.loadAll();

    for (let i = 0; i < names.length; i++) {

      const person = this.persons.find(p => p.name === names[i]);
      if (!person) {
        toSave.push({name: names[i]});
      }
    }

    if (toSave.length > 0) {
      for (let i = 0; i < toSave.length / 200; i++) {
        await personRepository.insert(toSave.slice(i * 200, (i + 1) * 200));
      }
      this.persons = await personRepository.find();
    }

  }


  public async onGalleryIndexUpdate() {
    await this.updateCounts();
    this.samplePhotos = {};
  }

  public async updateCounts() {
    const connection = await SQLConnection.getConnection();
    await connection.query('update person_entry set count = ' +
      ' (select COUNT(1) from face_region_entry where face_region_entry.personId = person_entry.id)');

    // remove persons without photo
    await connection.getRepository(PersonEntry)
      .createQueryBuilder()
      .where('count = 0')
      .delete()
      .execute();
  }

}

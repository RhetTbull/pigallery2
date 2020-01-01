import {PersonEntry} from '../sql/enitites/PersonEntry';
import {PhotoDTO} from '../../../../common/entities/PhotoDTO';
import {PersonDTO} from '../../../../common/entities/PersonDTO';

export interface IPersonManager {
  getAll(): Promise<PersonEntry[]>;

  getSamplePhoto(name: string): Promise<PhotoDTO>;

  getSamplePhotos(names: string[]): Promise<{ [key: string]: PhotoDTO }>;

  get(name: string): Promise<PersonEntry>;

  saveAll(names: string[]): Promise<void>;

  onGalleryIndexUpdate(): Promise<void>;

  updatePerson(name: string, partialPerson: PersonDTO): Promise<PersonEntry>;
}

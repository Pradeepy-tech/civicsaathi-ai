import {
  GENERATED_INITIAL_WARDS,
  VERIFIED_CATEGORY_DIRECTORY,
} from '../data/municipalDirectory.ts';

export const INITIAL_DEPARTMENTS = VERIFIED_CATEGORY_DIRECTORY.map((item) => ({
  code: item.departmentCode,
  nameEn: item.departmentNameEn,
  nameHi: item.departmentNameHi,
  categoryMapped: item.category,
  slaHoursCritical: item.slaCriticalHours,
  slaHoursHigh: item.slaHighHours,
  slaHoursMedium: item.slaMediumHours,
  slaHoursLow: item.slaLowHours,
  contactEmail: item.contactEmail,
}));

export const INITIAL_WARDS = GENERATED_INITIAL_WARDS;

export const DEMO_IMAGE_PATHS = {
  waterLeakBefore: '/src/assets/images/demo_water_leak_1793355195238.jpg',
  roadBefore: '/src/assets/images/demo_road_before_1793355192942.jpg',
  roadAfter: '/src/assets/images/demo_road_after_1793355194415.jpg',
};

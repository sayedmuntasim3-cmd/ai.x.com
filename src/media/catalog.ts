// The image sources Zupona searches, as plain data. The page imports this file for the source
// list; the search code in ./providers adds the actual API calls. Keep the two in step: every id
// here needs a searcher in providers/index.ts.

import type { SourceGroup, Topic } from "./types";

export type SourceInfo = {
  id: string;
  name: string;
  homepage: string;
  group: SourceGroup;
  /** What the source holds, in a few words. */
  holds: string;
  /** Rough size of its openly licensed images. */
  scale: string;
  topics: Topic[];
  /** Prior for how good a typical image is for a documentary, 0 to 1. */
  quality: number;
  /** Environment variables (Cloudflare secrets) that must be set before the source is used. */
  keys?: string[];
  /** Where to get the key (all are free). */
  signup?: string;
  /** Keys that are optional and only raise rate limits or switch to a richer API. */
  optionalKeys?: string[];
  /** Can take 5 to 15 s to answer a new query, so it gets a longer deadline (results stream in when ready). */
  slow?: boolean;
};

export const SOURCES: SourceInfo[] = [
  // Encyclopedic
  {
    id: "wikimedia-commons",
    name: "Wikimedia Commons",
    homepage: "https://commons.wikimedia.org",
    group: "Encyclopedic",
    holds: "The free media library behind Wikipedia: photos, maps, scans, featured pictures",
    scale: "100M+ files",
    topics: ["nature", "ocean", "space", "history", "science", "culture"],
    quality: 0.8,
  },
  {
    id: "wikipedia",
    name: "Wikipedia lead images",
    homepage: "https://en.wikipedia.org",
    group: "Encyclopedic",
    holds: "The image editors chose to lead each matching article",
    scale: "6M+ articles",
    topics: ["history", "culture", "science", "nature", "space", "ocean"],
    quality: 0.82,
  },
  {
    id: "openverse",
    name: "Openverse collections",
    homepage: "https://openverse.org",
    group: "Encyclopedic",
    holds: "40+ open collections in one index: Rawpixel, StockSnap, Geograph, Brooklyn Museum, Science Museum, Smithsonian, SpaceX and more",
    scale: "25M+ images",
    topics: ["culture", "history", "science", "nature", "space", "ocean"],
    quality: 0.66,
    optionalKeys: ["OPENVERSE_CLIENT_ID", "OPENVERSE_CLIENT_SECRET"],
    signup: "https://api.openverse.org/v1/#tag/auth/operation/register",
    slow: true,
  },

  // Space
  {
    id: "nasa",
    name: "NASA Image and Video Library",
    homepage: "https://images.nasa.gov",
    group: "Space",
    holds: "Missions, astronauts, Earth from orbit, telescopes",
    scale: "140,000+ images",
    topics: ["space", "science", "ocean"],
    quality: 0.86,
  },
  {
    id: "nasa-svs",
    name: "NASA Scientific Visualization Studio",
    homepage: "https://svs.gsfc.nasa.gov",
    group: "Space",
    holds: "Data visualisations of Earth, climate, the Sun and planets",
    scale: "10,000+ visualisations",
    topics: ["space", "science", "ocean"],
    quality: 0.78,
  },
  {
    id: "esa-hubble",
    name: "ESA/Hubble",
    homepage: "https://esahubble.org/images/",
    group: "Space",
    holds: "Hubble Space Telescope releases in full resolution",
    scale: "Full Hubble archive",
    topics: ["space", "science"],
    quality: 0.95,
    slow: true,
  },
  {
    id: "esa-webb",
    name: "ESA/Webb",
    homepage: "https://esawebb.org/images/",
    group: "Space",
    holds: "James Webb Space Telescope releases in full resolution",
    scale: "Full Webb archive",
    topics: ["space", "science"],
    quality: 0.95,
    slow: true,
  },
  {
    id: "eso",
    name: "European Southern Observatory",
    homepage: "https://www.eso.org/public/images/",
    group: "Space",
    holds: "VLT and ALMA images, observatory landscapes under the Chilean night sky",
    scale: "Full ESO archive",
    topics: ["space", "science"],
    quality: 0.93,
    slow: true,
  },
  {
    id: "noirlab",
    name: "NOIRLab",
    homepage: "https://noirlab.edu/public/images/",
    group: "Space",
    holds: "Gemini, Kitt Peak, Cerro Tololo and Rubin Observatory images",
    scale: "Full NOIRLab archive",
    topics: ["space", "science"],
    quality: 0.9,
    slow: true,
  },

  // Museums
  {
    id: "met",
    name: "The Metropolitan Museum of Art",
    homepage: "https://www.metmuseum.org/art/collection",
    group: "Museums",
    holds: "5,000 years of art and artefacts from every culture",
    scale: "490,000+ CC0 images",
    topics: ["history", "culture"],
    quality: 0.88,
  },
  {
    id: "artic",
    name: "Art Institute of Chicago",
    homepage: "https://www.artic.edu/collection",
    group: "Museums",
    holds: "Paintings, prints, photographs and design",
    scale: "60,000+ CC0 works",
    topics: ["history", "culture"],
    quality: 0.86,
  },
  {
    id: "cleveland",
    name: "Cleveland Museum of Art",
    homepage: "https://www.clevelandart.org/art/collection/search",
    group: "Museums",
    holds: "World art from antiquity to today, print-resolution files",
    scale: "60,000+ CC0 works",
    topics: ["history", "culture"],
    quality: 0.86,
  },
  {
    id: "rijksmuseum",
    name: "Rijksmuseum",
    homepage: "https://www.rijksmuseum.nl/en/collection",
    group: "Museums",
    holds: "Dutch Golden Age, maritime history, early photography",
    scale: "700,000+ public domain images",
    topics: ["history", "culture", "ocean"],
    quality: 0.9,
  },
  {
    id: "smk",
    name: "SMK – National Gallery of Denmark",
    homepage: "https://open.smk.dk",
    group: "Museums",
    holds: "European paintings, drawings and prints in very high resolution",
    scale: "50,000+ public domain works",
    topics: ["history", "culture"],
    quality: 0.86,
  },
  {
    id: "mia",
    name: "Minneapolis Institute of Art",
    homepage: "https://collections.artsmia.org",
    group: "Museums",
    holds: "Asian, African and European art, photography",
    scale: "Public domain collection",
    topics: ["history", "culture"],
    quality: 0.82,
  },

  // Libraries & archives
  {
    id: "loc",
    name: "Library of Congress",
    homepage: "https://www.loc.gov/photos/",
    group: "Libraries & archives",
    holds: "Historic photographs, prints, posters and drawings marked free to use",
    scale: "1M+ online images",
    topics: ["history", "culture"],
    quality: 0.74,
  },
  {
    id: "internet-archive",
    name: "Internet Archive",
    homepage: "https://archive.org/details/image",
    group: "Libraries & archives",
    holds: "Community uploads and digitised collections (public domain and CC only)",
    scale: "Millions of items",
    topics: ["history", "culture", "science"],
    quality: 0.46,
  },
  {
    id: "wellcome",
    name: "Wellcome Collection",
    homepage: "https://wellcomecollection.org/images",
    group: "Libraries & archives",
    holds: "Medicine, anatomy, the body and the history of science",
    scale: "100,000+ images",
    topics: ["science", "history"],
    quality: 0.78,
  },
  {
    id: "digitalnz",
    name: "DigitalNZ",
    homepage: "https://digitalnz.org",
    group: "Libraries & archives",
    holds: "New Zealand libraries, museums and Te Papa",
    scale: "30M+ records",
    topics: ["history", "culture", "nature", "ocean"],
    quality: 0.52,
    optionalKeys: ["DIGITALNZ_API_KEY"],
    signup: "https://digitalnz.org/developers",
  },
  {
    id: "ksamsok",
    name: "Swedish Open Cultural Heritage",
    homepage: "https://www.raa.se/in-english/digital-services/about-k-samsok/",
    group: "Libraries & archives",
    holds: "Swedish museums and archives, Viking to industrial age",
    scale: "Millions of records",
    topics: ["history", "culture"],
    quality: 0.55,
  },
  {
    id: "digital-commonwealth",
    name: "Digital Commonwealth",
    homepage: "https://www.digitalcommonwealth.org",
    group: "Libraries & archives",
    holds: "Massachusetts libraries and archives: photos, maps, postcards",
    scale: "Hundreds of thousands of items",
    topics: ["history", "culture"],
    quality: 0.62,
  },
  {
    id: "europeana",
    name: "Europeana",
    homepage: "https://www.europeana.eu",
    group: "Libraries & archives",
    holds: "Europe's museums, libraries and archives in one place",
    scale: "13M+ open images",
    topics: ["history", "culture", "science"],
    quality: 0.7,
    keys: ["EUROPEANA_API_KEY"],
    signup: "https://pro.europeana.eu/page/get-api",
  },
  {
    id: "smithsonian",
    name: "Smithsonian Open Access",
    homepage: "https://www.si.edu/openaccess",
    group: "Libraries & archives",
    holds: "21 Smithsonian museums: air and space, natural history, American history",
    scale: "5M+ CC0 images",
    topics: ["history", "science", "space", "nature", "culture"],
    quality: 0.8,
    keys: ["SMITHSONIAN_API_KEY"],
    signup: "https://api.data.gov/signup/",
  },
  {
    id: "nypl",
    name: "New York Public Library",
    homepage: "https://digitalcollections.nypl.org",
    group: "Libraries & archives",
    holds: "Maps, photographs, menus, prints and manuscripts",
    scale: "180,000+ public domain items",
    topics: ["history", "culture"],
    quality: 0.72,
    keys: ["NYPL_API_TOKEN"],
    signup: "https://api.repo.nypl.org/sign_up",
  },
  {
    id: "nara",
    name: "US National Archives",
    homepage: "https://catalog.archives.gov",
    group: "Libraries & archives",
    holds: "Federal photographs: wars, presidents, the space race, the land",
    scale: "Millions of digitised records",
    topics: ["history", "space", "nature"],
    quality: 0.72,
    keys: ["NARA_API_KEY"],
    signup: "https://www.archives.gov/research/catalog/help/api",
  },

  // Nature
  {
    id: "inaturalist",
    name: "iNaturalist",
    homepage: "https://www.inaturalist.org",
    group: "Nature",
    holds: "Research-grade wildlife and plant photos from naturalists worldwide",
    scale: "260M+ photos",
    topics: ["nature", "ocean"],
    quality: 0.68,
  },

  // Photography
  {
    id: "flickr",
    name: "Flickr (Creative Commons)",
    homepage: "https://www.flickr.com/creativecommons/",
    group: "Photography",
    holds: "Photographers worldwide sharing under CC BY, CC0 and public domain",
    scale: "500M+ CC photos",
    topics: ["nature", "ocean", "culture", "history", "science", "space"],
    quality: 0.66,
    optionalKeys: ["FLICKR_API_KEY"],
    signup: "https://www.flickr.com/services/apps/create/",
    // Slow only without a key, when it goes through Openverse.
    slow: true,
  },
  {
    id: "wordpress-photos",
    name: "WordPress Photo Directory",
    homepage: "https://wordpress.org/photos/",
    group: "Photography",
    holds: "Reviewed CC0 photos, full camera resolution",
    scale: "40,000+ photos",
    topics: ["nature", "culture", "ocean"],
    quality: 0.7,
  },
  {
    id: "unsplash",
    name: "Unsplash",
    homepage: "https://unsplash.com",
    group: "Photography",
    holds: "Professional photography, landscapes, cities and people",
    scale: "5M+ photos",
    topics: ["nature", "ocean", "culture", "space"],
    quality: 0.88,
    keys: ["UNSPLASH_ACCESS_KEY"],
    signup: "https://unsplash.com/oauth/applications",
  },
  {
    id: "pixabay",
    name: "Pixabay",
    homepage: "https://pixabay.com",
    group: "Photography",
    holds: "Stock photos and illustrations",
    scale: "5M+ images",
    topics: ["nature", "ocean", "culture", "science"],
    quality: 0.72,
    keys: ["PIXABAY_API_KEY"],
    signup: "https://pixabay.com/api/docs/",
  },
];

export const SOURCE_GROUPS: SourceGroup[] = ["Space", "Museums", "Libraries & archives", "Encyclopedic", "Nature", "Photography"];

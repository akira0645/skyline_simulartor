import portraits from '../assets/street/portraits.png';
import residents from '../assets/street/residents.json';
import { residentAppearance } from '../rendering/residentAppearance';

export function PersonPortrait({ seed, id, age, name }: { seed: number; id: number; age: number; name: string }) {
  const profile = residentAppearance(seed, id, age);
  const size = residents.portrait * 2;
  return <span className="person-portrait" role="img" aria-label={`${name}的頭像`} style={{
    width: size, height: size, backgroundImage: `url(${portraits})`,
    backgroundSize: `${size * residents.variants}px ${size * residents.ages.length}px`,
    backgroundPosition: `${-(profile % residents.variants) * size}px ${-Math.floor(profile / residents.variants) * size}px`,
  }} />;
}

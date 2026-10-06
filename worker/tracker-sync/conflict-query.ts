import {isRegionId,type RegionId} from '../../src/domain/hotels';
import {trackerConflictCategories,type TrackerConflictCategory} from '../../src/domain/tracker-conflicts';
/** Shared strict admission shape; cursor authenticity is checked by its API. */
export function parseTrackerConflictQuery(url:URL):{region:RegionId;category:TrackerConflictCategory;cursor:string|null}{
 const q=url.searchParams;if(url.pathname!=='/api/reports/tracker-conflicts')throw Error('tracker_invalid');
 for(const key of q.keys())if(!['region','category','cursor'].includes(key)||q.getAll(key).length!==1)throw Error('tracker_invalid');
 const region=q.get('region'),category=q.get('category')??'all',cursor=q.get('cursor');
 if(!isRegionId(region)||!trackerConflictCategories.includes(category as TrackerConflictCategory)||cursor!==null&&(cursor.length>800||!/^[A-Za-z0-9_-]+\.[a-f0-9]{64}$/.test(cursor)))throw Error('tracker_invalid');
 return {region,category:category as TrackerConflictCategory,cursor};
}

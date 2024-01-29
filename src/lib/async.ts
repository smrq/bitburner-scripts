export async function filterAsync<T>(array: T[], predicate: (item: T, index: number, array: T[]) => Promise<boolean>) {
	const include = await Promise.all(array.map(predicate));
	return array.filter((_, i) => include[i]);
}

import { onMounted, onUnmounted, ref } from 'vue';
import { _isPaused, _setPaused, PAUSE_STORAGE_KEY } from './pause.ts';

/** Reactive "all rules paused" flag that also follows changes made from the keyboard shortcut. */
export function usePaused() {
	const paused = ref(false);

	const onStorageChanged = (
		changes: Record<string, chrome.storage.StorageChange>,
		area: string
	) => {
		if (area === 'local' && changes[PAUSE_STORAGE_KEY]) {
			paused.value = changes[PAUSE_STORAGE_KEY].newValue === true;
		}
	};

	onMounted(async () => {
		paused.value = await _isPaused();
		chrome.storage.onChanged.addListener(onStorageChanged);
	});

	onUnmounted(() => {
		chrome.storage.onChanged.removeListener(onStorageChanged);
	});

	const setPaused = async (value: boolean) => {
		paused.value = value;
		await _setPaused(value);
	};

	return { paused, setPaused };
}

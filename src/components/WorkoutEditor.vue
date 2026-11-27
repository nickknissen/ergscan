<script setup lang="ts">
import MdIcon from '@nickknissen/m3-vue/components/MdIcon.vue';
import MdSelect from '@nickknissen/m3-vue/components/MdSelect.vue';
import { handleCellKeydown } from '@nickknissen/m3-vue/ui/keyboardNav';
import { computed, useId, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { fromLocalInput, toLocalInput } from '../core/dates';
import { FEELINGS, type Feeling } from '../core/feeling';
import { emptyRow, moveExtraColumn, sumRows, type ExtraColumn, type Workout, type WorkoutRow } from '../core/workout';
import { suggestName } from '../core/workoutName';
import { FEELING_ICONS } from '../ui/icons';
import { CELL_HINT_ID, provideInvalidCells } from './cellValidity';
import NumberCell from './NumberCell.vue';
import TimeCell from './TimeCell.vue';

const workout = defineModel<Workout>('workout', { required: true });
const extraColumn = defineModel<ExtraColumn | null>('extraColumn', { required: true });
const invalidCount = defineModel<number>('invalidCount', { default: 0 });

const invalidCells = provideInvalidCells();
watch(
  () => invalidCells.size,
  (size) => (invalidCount.value = size),
  { immediate: true },
);

const { t } = useI18n();

const id = useId();

const splitOptions = [
  { value: 500, label: '500 m' },
  { value: 1000, label: '1000 m' },
];

const extraOptions: ExtraColumn[] = ['heartRate', 'watts', 'calories'];

const extraSelectOptions = computed(() => [
  { value: '' as const, label: t('review.none') },
  ...extraOptions.map((option) => ({ value: option, label: t(`columns.${option}`) })),
]);

const startInput = computed({
  get: () => toLocalInput(workout.value.startTime),
  set: (value: string) => {
    const date = fromLocalInput(value);
    if (date) workout.value.startTime = date;
  },
});

const suggestedName = computed(() => suggestName(workout.value) ?? '');

const name = computed({
  get: () => workout.value.name ?? '',
  set: (value: string) => (workout.value.name = value || null),
});

/** Tapping the chosen face again clears the rating. */
function toggleFeeling(feeling: Feeling) {
  workout.value.feeling = workout.value.feeling === feeling ? null : feeling;
}

const notes = computed({
  get: () => workout.value.notes ?? '',
  set: (value: string) => (workout.value.notes = value || null),
});

const extraSelection = computed({
  get: () => extraColumn.value ?? '',
  set: (value: ExtraColumn | '') => {
    const next = value === '' ? null : value;
    if (extraColumn.value && next) moveExtraColumn(workout.value, extraColumn.value, next);
    extraColumn.value = next;
  },
});

const splitHeader = computed(() => t('columns.split', { distance: workout.value.splitDistance }));

function label(column: string, row: WorkoutRow): string {
  const index = workout.value.rows.indexOf(row);
  return index < 0 ? `${t('review.total')} ${column}` : `${column} ${index + 1}`;
}

function addRow() {
  workout.value.rows.push(emptyRow());
}

function removeRow(index: number) {
  workout.value.rows.splice(index, 1);
}

function recalculate() {
  workout.value.summary = sumRows(workout.value.rows, workout.value.splitDistance);
}
</script>

<template>
  <section class="editor">
    <div class="editor-details">
      <h2 class="group-header">{{ t('review.details') }}</h2>
      <div class="group">
        <label class="group-row">
          <span class="row-label">{{ t('review.name') }}</span>
          <input v-model.trim="name" class="row-value" type="text" :placeholder="suggestedName" autocomplete="off" />
        </label>
        <label class="group-row">
          <span class="row-label">{{ t('review.start') }}</span>
          <input v-model="startInput" class="row-value" type="datetime-local" />
        </label>
        <div class="group-row">
          <span :id="`${id}-split`" class="row-label">{{ t('review.splitDistance') }}</span>
          <MdSelect v-model="workout.splitDistance" :options="splitOptions" :labelledby="`${id}-split`" />
        </div>
        <div class="group-row">
          <span :id="`${id}-extra`" class="row-label">{{ t('review.extraColumn') }}</span>
          <MdSelect v-model="extraSelection" :options="extraSelectOptions" :labelledby="`${id}-extra`" />
        </div>
        <label class="group-row">
          <span class="row-label">{{ t('review.dragFactor') }}</span>
          <NumberCell v-model="workout.dragFactor" class="row-value" :label="t('review.dragFactor')" />
        </label>
        <label class="group-row stacked">
          <span class="row-label">{{ t('review.notes') }}</span>
          <textarea v-model="notes" class="row-notes" rows="3"></textarea>
        </label>
        <div class="group-row feeling-row">
          <span :id="`${id}-feeling`" class="row-label">{{ t('review.feeling') }}</span>
          <div class="feelings" role="group" :aria-labelledby="`${id}-feeling`">
            <button
              v-for="feeling in FEELINGS"
              :key="feeling"
              type="button"
              class="icon"
              :aria-pressed="workout.feeling === feeling"
              :aria-label="t(`feelings.${feeling}`)"
              :title="t(`feelings.${feeling}`)"
              @click="toggleFeeling(feeling)"
            >
              <MdIcon :name="FEELING_ICONS[feeling]" :filled="workout.feeling === feeling" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="editor-splits">
      <h2 class="group-header">{{ t('review.splits') }}</h2>
      <div class="group table-wrap">
        <table :class="{ 'has-extra': extraColumn }">
          <thead>
            <tr>
              <th>{{ t('columns.time') }}</th>
              <th>{{ t('columns.meter') }}</th>
              <th>{{ splitHeader }}</th>
              <th class="col-small"><abbr :title="t('columns.rateLong')">{{ t('columns.rate') }}</abbr></th>
              <th v-if="extraColumn" class="col-small">{{ t(`columns.${extraColumn}`) }}</th>
              <th class="col-tight">{{ t('columns.rest') }}</th>
              <th class="col-tight"></th>
            </tr>
          </thead>
          <tbody @keydown="handleCellKeydown($event, '.cell')">
            <tr class="row-caption">
              <th :colspan="extraColumn ? 7 : 6" scope="rowgroup">{{ t('review.total') }}</th>
            </tr>
            <tr class="summary">
              <td><TimeCell v-model="workout.summary.durationDs" :label="label(t('columns.time'), workout.summary)" /></td>
              <td><NumberCell v-model="workout.summary.distanceM" :label="label(t('columns.meter'), workout.summary)" /></td>
              <td><TimeCell v-model="workout.summary.splitDs" :label="label(splitHeader, workout.summary)" /></td>
              <td><NumberCell v-model="workout.summary.rate" :label="label(t('columns.rateLong'), workout.summary)" /></td>
              <td v-if="extraColumn">
                <NumberCell v-model="workout.summary[extraColumn]" :label="label(t(`columns.${extraColumn}`), workout.summary)" />
              </td>
              <td></td>
              <td></td>
            </tr>
            <tr v-if="workout.rows.length" class="row-caption">
              <th :colspan="extraColumn ? 7 : 6" scope="rowgroup">{{ t('review.splits') }}</th>
            </tr>
            <tr v-for="(row, index) in workout.rows" :key="index" :class="{ rest: row.isRest }">
              <td><TimeCell v-model="row.durationDs" :label="label(t('columns.time'), row)" /></td>
              <td><NumberCell v-model="row.distanceM" :label="label(t('columns.meter'), row)" /></td>
              <td><TimeCell v-model="row.splitDs" :label="label(splitHeader, row)" /></td>
              <td><NumberCell v-model="row.rate" :label="label(t('columns.rateLong'), row)" /></td>
              <td v-if="extraColumn">
                <NumberCell v-model="row[extraColumn]" :label="label(t(`columns.${extraColumn}`), row)" />
              </td>
              <td class="center">
                <label class="check-hit">
                  <input v-model="row.isRest" type="checkbox" class="check" :aria-label="label(t('columns.rest'), row)" />
                  <MdIcon name="check" class="check-mark" />
                </label>
              </td>
              <td class="center">
                <button
                  type="button"
                  class="icon"
                  :aria-label="t('review.removeRow', { number: index + 1 })"
                  :title="t('review.removeRow', { number: index + 1 })"
                  @click="removeRow(index)"
                >
                  <MdIcon name="do_not_disturb_on" />
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="invalidCells.size" :id="CELL_HINT_ID" class="field-error" role="alert">{{ t('review.invalidCells') }}</p>

      <div class="group">
        <button type="button" class="group-row tappable accent" @click="addRow">
          <MdIcon name="add" class="row-icon" />
          <span class="row-label">{{ t('review.addRow') }}</span>
        </button>
        <button type="button" class="group-row tappable accent" @click="recalculate">
          <MdIcon name="calculate" class="row-icon" />
          <span class="row-label">{{ t('review.recalculate') }}</span>
        </button>
      </div>
    </div>
  </section>
</template>

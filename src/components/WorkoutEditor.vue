<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { fromLocalInput, toLocalInput } from '../core/dates';
import { emptyRow, moveExtraColumn, sumRows, type ExtraColumn, type Workout, type WorkoutRow } from '../core/workout';
import NumberCell from './NumberCell.vue';
import TimeCell from './TimeCell.vue';

const workout = defineModel<Workout>('workout', { required: true });
const extraColumn = defineModel<ExtraColumn | null>('extraColumn', { required: true });

const { t } = useI18n();

const extraOptions: ExtraColumn[] = ['heartRate', 'watts', 'calories'];

const startInput = computed({
  get: () => toLocalInput(workout.value.startTime),
  set: (value: string) => {
    const date = fromLocalInput(value);
    if (date) workout.value.startTime = date;
  },
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
    <div class="fields">
      <label>
        {{ t('review.start') }}
        <input v-model="startInput" type="datetime-local" />
      </label>
      <label>
        {{ t('review.splitDistance') }}
        <select v-model.number="workout.splitDistance">
          <option :value="500">500 m</option>
          <option :value="1000">1000 m</option>
        </select>
      </label>
      <label>
        {{ t('review.extraColumn') }}
        <select v-model="extraSelection">
          <option value="">{{ t('review.none') }}</option>
          <option v-for="option in extraOptions" :key="option" :value="option">{{ t(`columns.${option}`) }}</option>
        </select>
      </label>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th class="col-time">{{ t('columns.time') }}</th>
            <th class="col-meter">{{ t('columns.meter') }}</th>
            <th class="col-split">{{ splitHeader }}</th>
            <th class="col-small">{{ t('columns.rate') }}</th>
            <th v-if="extraColumn" class="col-small">{{ t(`columns.${extraColumn}`) }}</th>
            <th class="col-tight">{{ t('columns.rest') }}</th>
            <th class="col-tight"></th>
          </tr>
        </thead>
        <tbody>
          <tr class="summary">
            <td><TimeCell v-model="workout.summary.durationDs" :label="label(t('columns.time'), workout.summary)" /></td>
            <td><NumberCell v-model="workout.summary.distanceM" :label="label(t('columns.meter'), workout.summary)" /></td>
            <td><TimeCell v-model="workout.summary.splitDs" :label="label(splitHeader, workout.summary)" /></td>
            <td><NumberCell v-model="workout.summary.rate" :label="label(t('columns.rate'), workout.summary)" /></td>
            <td v-if="extraColumn">
              <NumberCell v-model="workout.summary[extraColumn]" :label="label(t(`columns.${extraColumn}`), workout.summary)" />
            </td>
            <td></td>
            <td></td>
          </tr>
          <tr v-for="(row, index) in workout.rows" :key="index" :class="{ rest: row.isRest }">
            <td><TimeCell v-model="row.durationDs" :label="label(t('columns.time'), row)" /></td>
            <td><NumberCell v-model="row.distanceM" :label="label(t('columns.meter'), row)" /></td>
            <td><TimeCell v-model="row.splitDs" :label="label(splitHeader, row)" /></td>
            <td><NumberCell v-model="row.rate" :label="label(t('columns.rate'), row)" /></td>
            <td v-if="extraColumn">
              <NumberCell v-model="row[extraColumn]" :label="label(t(`columns.${extraColumn}`), row)" />
            </td>
            <td class="center">
              <input v-model="row.isRest" type="checkbox" :aria-label="label(t('columns.rest'), row)" />
            </td>
            <td class="center">
              <button type="button" class="icon" :aria-label="t('review.removeRow', { number: index + 1 })" @click="removeRow(index)">×</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="row-actions">
      <button type="button" class="secondary" @click="addRow">{{ t('review.addRow') }}</button>
      <button type="button" class="secondary" @click="recalculate">{{ t('review.recalculate') }}</button>
    </div>
  </section>
</template>

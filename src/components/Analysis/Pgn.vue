<template>
  <div class="pgn-display">
    <div
      class="pgn-move"
      v-for="(move, index) in formattedPgn"
      @click="sendPGNMoves(index)"
    >
      {{ move }}
    </div>
  </div>
</template>

<script lang="ts">
import { formatPv } from "@/ts/FormatInput";

export default {
  props: {
    movehistory: {
      type: Array,
      required: true,
    },
  },
  computed: {
    formattedPgn() {
      return this.formatPv(this.movehistory as string[]);
    },
  },
  methods: {
    formatPv,
    sendPGNMoves(moveIndex: number) {
      const formatted = this.formatPv(this.movehistory as string[]);
      let pgn = "";
      formatted.forEach((move, index) => {
        if (index > moveIndex) {
          return;
        }
        pgn += move.trim() + " ";
      });
      pgn = pgn.trim();
      this.$emit("send-pgn-moves", pgn);
    },
  },
};
</script>

<style scoped>
.pgn-display {
  font-family: monospace;
  background-color: var(--bg-secondary);
  border-radius: 5px;
}

.pgn-move {
  padding: 5px;
  user-select: none;
  display: inline-block;
  transition: transform 0.2s ease-in-out;
  border-radius: 5px;
}

.pgn-move:hover {
  cursor: pointer;
  color: #34d399;
  background-color: #1e1e24;
  transform: scale(1.2) perspective(10px);
}
</style>

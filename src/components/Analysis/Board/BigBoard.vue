<script lang="ts">
import { defineComponent } from "vue";

import { Chessground } from "chessgroundx";
import { Notation } from "chessgroundx/types";
import { Chess, SQUARES } from "@/ts/xiangqi";
import { uciToUCICyclone, uciCycloneToUCI } from "@/ts/MoveProcess";

import type { Move } from "@/ts/UciFilter";
import type { Color, Key } from "chessgroundx/types";

type ChessgroundInstance = ReturnType<typeof Chessground>;

const startpos = "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1";

export default defineComponent({
  data() {
    return {
      showPromotion: false,
      promotionMove: { origin: "", destination: "" },

      cg: null as ChessgroundInstance | null,
      game: Chess(),

      moveHistoryLan: [] as string[],
      moveHistorySan: [] as string[]
    };
  },
  mounted() {
    const config = {
      movable: {
        color: "white" as Color,
        free: false,
        dests: this.toDests()
      },
      draggable: {
        showGhost: true
      },
      events: {
        move: this.makeMove
      },
      highlight: {
        lastMove: true,
        check: true
      },
      drawable: {
        enabled: false,
        eraseOnClick: false
      },
      dimensions: {
        width: 9,
        height: 10
      },
      notation: Notation.XIANGQI_HANNUM
    };

    const board = this.$refs.board as HTMLElement;
    this.cg = Chessground(board, config);

    this.calculateSquareSize();
    window.addEventListener("resize", this.calculateSquareSize);

    this.newPositionFen(startpos);
  },
  beforeUnmount() {
    window.removeEventListener("resize", this.calculateSquareSize);
  },
  methods: {
    calculateSquareSize() {
      const boardSpace = this.$refs.boardSpace as HTMLElement;

      // Lets get the width/height without padding and borders
      const cs = window.getComputedStyle(boardSpace);

      const paddingX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      const paddingY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);

      const borderX =
        parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
      const borderY =
        parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);

      let size = Math.min(
        boardSpace.offsetWidth - paddingX - borderX,
        boardSpace.offsetHeight - paddingY - borderY
      );

      size -= 7; // adjust for borders and padding
      // fix chrome alignment errors; https://github.com/ornicar/lila/pull/3881
      size -= size % 8; // ensure the size is a multiple of 8

      size = Math.min(size, 800);

      const boardWrap = document.querySelector(".board.cg-wrap") as HTMLElement;

      boardWrap.style.width = (size * 9) / 10 + "px";
      boardWrap.style.height = size + "px";
      document.body.dispatchEvent(new Event("chessground.resize"));
    },
    clearLastMove() {
      this.cg?.set({ lastMove: undefined });
    },
    updateCG() {
      this.cg?.set({
        fen: this.game.fen(),
        turnColor: this.toColor(),
        movable: {
          color: this.toColor(),
          dests: this.toDests()
        }
      });

      // set check highlighting
      if (this.game.inCheck()) {
        this.cg?.set({
          check: this.toColor()
        });
      } else {
        this.cg?.set({
          check: undefined
        });
      }

      // emit new fen
      this.$emit("updated-cg", this.game.fen());
    },
    drawMove(move: Move) {
      this.cg?.setShapes([
        {
          orig: move.orig as Key,
          dest: move.dest as Key,
          brush: "paleBlue"
        }
      ]);
    },
    drawMoveStr(origin: string, dest: string) {
      this.cg?.setShapes([
        {
          orig: origin as Key,
          dest: dest as Key,
          brush: "paleBlue"
        }
      ]);
    },
    toColor(): Color {
      return this.game.turn() === "w" ? "white" : "black";
    },
    // movable destionations for a piece
    toDests() {
      const dests = new Map();
      SQUARES.forEach((s) => {
        const moves = this.game.moves({ square: s });
        if (moves.length) {
          moves.map((m) => {
            const { from, to } = uciCycloneToUCI(m.slice(0, 2), m.slice(2, 4));
            dests.set(from, (dests.get(from) || []).concat(to));
          });
        }
      });
      console.log(dests);
      return dests;
    },
    undo() {
      this.game.undo();

      this.moveHistoryLan.pop();
      this.moveHistorySan.pop();

      this.sendUpdates();
    },
    async makeMove(origin: string, destination: string) {
      let { from, to } = uciToUCICyclone(origin, destination);
      // do move
      const move = this.game.move({
        from: from,
        to: to
      });

      this.updateMove(move);
    },
    async sendUpdates() {
      this.$emit("updated-move", {
        moveHistoryLan: this.moveHistoryLan,
        moveHistorySan: this.moveHistorySan
      });

      this.updateCG();

      let status = "";

      if (this.game.isCheckmate()) {
        status = "CHECKMATE";
      } else if (this.game.isStalemate()) {
        status = "STALEMATE";
      } else if (this.game.isThreefoldRepetition()) {
        status = "THREEFOLD REPETITION";
      } else if (this.game.isInsufficientMaterial()) {
        status = "INSUFFICIENT MATERIAL";
      }

      this.$emit("updated-status", status);

      this.$emit("updated-sidetomove", this.toColor());
    },
    async updateMove(move: any) {
      if (move === null) {
        return "snapback";
      }

      this.moveHistoryLan.push(move.iccs);
      this.moveHistorySan.push(move.iccs);

      this.sendUpdates();
    },
    async playMoves(moves: string) {
      const movesArray = moves.trim().split(" ");

      this.clearLastMove();

      for (let i = 0; i < movesArray.length; i++) {
        if (this.game.isGameOver()) {
          this.updateCG();

          return;
        }

        const move = movesArray[i];
        const chessMove = this.game.move(move);

        if (chessMove === null) {
          this.updateCG();

          return;
        }

        this.moveHistoryLan.push(chessMove.iccs);
        this.moveHistorySan.push(chessMove.iccs);
      }

      this.sendUpdates();
    },
    async newPositionFen(fen: string) {
      this.game.load(fen);

      this.moveHistoryLan = [];
      this.moveHistorySan = [];

      this.updateCG();
      this.clearLastMove();
    },
    async newPositionPgn(pgn: string) {
      this.game.loadPgn(pgn);

      let history = this.game.history({ verbose: true });

      this.moveHistoryLan = [];
      this.moveHistorySan = [];

      history.forEach((move) => {
        this.updateMove(move);
        this.clearLastMove();
      });
    }
  }
});
</script>

<template>
  <div class="board-space" ref="boardSpace">
    <div class="board" ref="board"></div>
  </div>
</template>

<style>
@media only screen and (min-width: 600px) {
    .board-space {
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        width: 100%;
        height: 100%;
        padding-left: 5rem;
    }
}

@media only screen and (max-width: 600px) {
    .board-space {
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        width: 100%;
        height: 100%;
    }
}
</style>

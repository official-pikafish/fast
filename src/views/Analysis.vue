<script lang="ts">
import { defineComponent } from "vue";

import Sidebar from "@/components/AppSideBar.vue";
import EngineStats from "@/components/Analysis/EngineStats.vue";
import EngineButtons from "@/components/Analysis/EngineButtons.vue";
import Fen from "@/components/Analysis/Fen.vue";
import EngineLines from "@/components/Analysis/EngineLines.vue";
import Pgn from "@/components/Analysis/Pgn.vue";
import ChessGroundBoard from "@/components/Analysis/Board/BigBoard.vue";

import { filterUCIInfo } from "@/ts/UciFilter";
import { extractPV } from "@/ts/PrincipalVariation";
import ChessProcess from "@/ts/ChessProcess";

import { extractScore, type EngineInfo } from "@/ts/UciFilter";
import type { PV } from "@/ts/PrincipalVariation";

const startpos =
  "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1";

export default defineComponent({
  name: "app",
  components: {
    Sidebar: Sidebar,
    EngineStats: EngineStats,
    Fen: Fen,
    EngineButtons: EngineButtons,
    EngineLines: EngineLines,
    Pgn: Pgn,
    ChessGroundBoard: ChessGroundBoard,
  },
  data() {
    return {
      chessProcess: null as ChessProcess | null,

      activeTabIndex: 0,
      smallNavbar: [
        {
          id: "engine-lines",
          name: "Engine Lines",
        },
        {
          id: "prompt",
          name: "Prompt",
        },
        {
          id: "settings",
          name: "Settings",
        },
      ],

      engine_info: {
        score: "0",
        nodes: "0",
        nps: "0",
        depth: "0",
        time: "0",
        tbhits: "0",
        hashfull: "0",
      } as EngineInfo,

      isEngineAlive: false,
      isRunning: false,

      moveHistoryLan: [] as string[],
      moveHistorySan: [] as string[],

      engineLines: new Map<string, PV>(),

      startFen: startpos,
      currentFen: startpos,

      status: "IDLE",
      sideToMove: "white",

      evalHistory: [] as number[],
      graphTimer: null as number | null,
      series: [
        {
          name: "series-1",
          data: [] as number[],
        },
      ],
      options: {
        colors: ["#1D4ED8"],
        stroke: {
          curve: "straight",
          width: 2.5,
        },
        markers: {
          size: 0,
          hover: {
            size: null,
            sizeOffset: 0,
          },
        },
        chart: {
          toolbar: {
            show: false,
          },
          zoom: {
            enabled: false,
          },
          animations: {
            enabled: false,
          },
        },
        legend: {
          show: false,
          onItemHover: {
            highlightDataSeries: false,
          },
        },
        tooltip: {
          enabled: false,
        },
        xaxis: {
          labels: {
            show: false,
          },
          type: "numeric",
        },
        yaxis: {
          tickAmount: 2,
          min: -5,
          max: 5,
          labels: {
            show: false,
          },
          opacity: 0,
        },
      },
    };
  },
  computed: {
    activeTab(): string {
      return this.smallNavbar[this.activeTabIndex].id;
    },
    updateAnalysisStatus(): string {
      let status = this.status;

      if (status === "" || status === "IDLE") {
        if (this.isRunning) {
          status = "ANALYSIS";
        } else if (this.isEngineAlive) {
          status = "READY";
        }
      } else {
        status = this.status;

        this.sendEngineCommand("stop");
      }

      return status;
    },
  },
  mounted() {
    this.initEngine();

    this.graphTimer = setInterval(() => {
      const copy = [...this.evalHistory];
      this.series[0].data = copy;
    }, 50);

    window.addEventListener("keydown", this.handleKeydown);
  },
  beforeUnmount() {
    clearInterval(this.graphTimer!);

    window.removeEventListener("keydown", this.handleKeydown);

    this.sendEngineCommand("quit");
  },
  methods: {
    evalFunction(x: number) {
      return (5 - Math.pow(2, -(Math.abs(x) - 2.319281))) * (x < 0 ? -1 : 1);
    },
    normalizePerspectiveScore(score: number) {
      if (this.sideToMove === "black") {
        return -score;
      }
      return score;
    },
    normalizeScoreStr(score: string | undefined) {
      if (score === undefined) return "";
      let norm = "";
      if (score.startsWith("cp")) {
        const cp = Number(score.slice(2));
        norm = "cp " + this.normalizePerspectiveScore(cp);
      } else if (score.startsWith("mate")) {
        const mateIn = Number(score.slice(4));
        norm = "mate " + this.normalizePerspectiveScore(mateIn);
      }
      return norm;
    },
    getUciMoves() {
      return this.moveHistoryLan.join(" ");
    },
    updatedSideToMove(side: string) {
      this.sideToMove = side;
    },
    updatedStatus(status: string) {
      this.status = status;
    },
    async updatedMove(moves: any) {
      this.moveHistoryLan = moves["moveHistoryLan"];
      this.moveHistorySan = moves["moveHistorySan"];

      const score = extractScore(this.engine_info.score, this.sideToMove) / 100;
      this.evalHistory.push(
        this.evalFunction(this.normalizePerspectiveScore(score))
      );

      this.shiftInfoStats();

      if (this.isRunning) {
        await this.sendEngineCommand("stop");
        this.sendEngineCommand("go");
      }
    },
    updatedCg(fen: string) {
      this.currentFen = fen;

      let activeLine: PV = null as any;

      this.engineLines.forEach((pv) => {
        if (pv.active) {
          activeLine = pv;
        }
      });

      if (activeLine && activeLine.pv.length > 0) {
        (this.$refs.chessGroundBoardRef as any).drawMoveStr(
          activeLine.pv[0].substring(0, 2),
          activeLine.pv[0].substring(2, 4)
        );
      }
    },
    async handleKeydown(event: KeyboardEvent) {
      if (event.key === "g" && event.ctrlKey && !this.isRunning) {
        event.preventDefault();
        this.sendEngineCommand("go");
      } else if (event.key === "h" && event.ctrlKey) {
        event.preventDefault();
        this.sendEngineCommand("stop");
      } else if (event.key === "r" && event.ctrlKey && !this.isRunning) {
        event.preventDefault();
        this.sendEngineCommand("restart");
      } else if (event.key === "n" && event.ctrlKey) {
        event.preventDefault();
        this.sendEngineCommand("stop");
        this.newPosition(startpos);
      } else if (event.key === "ArrowLeft") {
        (this.$refs.chessGroundBoardRef as any).undo();
      }
    },
    clearInfoStats() {
      this.engineLines.clear();

      this.engine_info = {
        nodes: "0",
        nps: "0",
        depth: "0",
        time: "0",
        tbhits: "0",
        hashfull: "0",
      };
    },
    async updateInfoStats(line: string) {
      if (!this.isEngineAlive || !this.isRunning || !line.startsWith("info")) {
        return;
      }

      const filtered = filterUCIInfo(line);
      if (Object.keys(filtered).length === 0) {
        return;
      }

      filtered.score = this.normalizeScoreStr(filtered.score);

      if (filtered.score === "") {
        filtered.score = this.engine_info.score;
      }

      // only update changed values
      this.engine_info = { ...this.engine_info, ...filtered };

      if (
        this.engine_info.pv &&
        this.engine_info.pv.length > 0 &&
        this.engine_info.pv[0].orig !== "" &&
        this.engine_info.pv[0].dest !== "" &&
        this.isEngineAlive
      ) {
        (this.$refs.chessGroundBoardRef as any).drawMove(
          this.engine_info.pv[0]
        );
      }

      if (this.engine_info.score) {
        const score =
          extractScore(this.engine_info.score, this.sideToMove) / 100;
        const lastIndex = Math.max(0, this.evalHistory.length - 1);
        this.evalHistory[lastIndex] = this.evalFunction(
          this.normalizePerspectiveScore(score)
        );
      }

      const lines = extractPV(line);
      lines.score = this.normalizeScoreStr(lines.score);

      if (lines.pv[0]) {
        for (const [key, value] of this.engineLines.entries()) {
          if (value.active) {
            value.active = false;
            break;
          }
        }

        lines.active = true;
        this.engineLines.set(lines.pv[0], lines);
      }
    },
    shiftInfoStats() {
      // remove all other lines and shift the line with the played move to the right
      let correctLine: PV = null as any;
      const moves = this.moveHistoryLan;

      const playedMove = moves[moves.length - 1];

      this.engineLines.forEach((pv, key) => {
        if (key === playedMove) {
          correctLine = pv;
          correctLine.pv.shift();
        }
      });

      this.engineLines.clear();

      if (correctLine && correctLine.pv.length > 0) {
        this.engineLines.set(correctLine.pv[0], correctLine);
      }
    },
    async newPosition(fen: string) {
      this.clearInfoStats();
      this.startFen = fen;

      this.moveHistoryLan = [];
      this.moveHistorySan = [];

      this.evalHistory = [];

      (this.$refs.chessGroundBoardRef as any).newPositionFen(fen);

      if (this.isRunning) {
        await this.sendEngineCommand("stop");
        this.chessProcess?.write("ucinewgame");
      }
    },
    async playMoves(moves: string) {
      const n = moves.trim().split(" ").length;
      const lastEval = this.evalHistory[this.evalHistory.length - 1];
      for (let i = 0; i < n; i++) {
        this.evalHistory.push(lastEval);
      }

      await this.sendEngineCommand("stop");
      (this.$refs.chessGroundBoardRef as any).playMoves(moves);
    },
    async parsePgn(pgn: string) {
      await this.sendEngineCommand("stop");
      (this.$refs.chessGroundBoardRef as any).newPositionPgn(pgn);
    },
    async initEngine() {
      const enginesData = localStorage.getItem("engines");
      const engines = enginesData ? JSON.parse(enginesData) : [];

      if (engines.length === 0) {
        return;
      }

      if (this.chessProcess) {
        this.sendEngineCommand("quit");
      }

      this.isEngineAlive = true;

      this.chessProcess = new ChessProcess(engines[0].path, (line) => {
        this.updateInfoStats(line);
      });

      await this.chessProcess.start();
      this.chessProcess.sendOptions(engines[0].settings);
    },
    async sendEngineCommand(command: string) {
      if (command === "go" && (this.status === "" || this.status === "IDLE")) {
        this.clearInfoStats();

        if (!this.isEngineAlive) {
          await this.initEngine();
        }

        if (this.startFen === startpos && this.getUciMoves() === "") {
          this.chessProcess?.sendStartpos();
        } else if (this.startFen === startpos) {
          this.chessProcess?.sendStartposMoves(this.getUciMoves());
        } else {
          this.chessProcess?.sendPositionMoves(
            this.startFen,
            this.getUciMoves()
          );
        }
        this.isRunning = true;
        this.chessProcess?.sendGo();
      } else if (command === "stop") {
        this.isRunning = false;
        await this.chessProcess?.sendStop();
      } else if (command === "quit") {
        this.isEngineAlive = false;
        this.isRunning = false;
        await this.chessProcess?.sendStop();
        await this.chessProcess?.sendQuit();
      } else if (command === "restart") {
        this.isRunning = false;
        this.isEngineAlive = false;

        this.clearInfoStats();

        await this.chessProcess?.sendStop();
        await this.chessProcess?.sendQuit();
        await this.initEngine();
      }

      localStorage.setItem("status", this.isRunning.toString());
    },
  },
});
</script>

<template>
  <div>
    <main class="analysis">
      <div class="game">
        <ChessGroundBoard
          ref="chessGroundBoardRef"
          @updated-sidetomove="updatedSideToMove"
          @updated-status="updatedStatus"
          @updated-move="updatedMove"
          @updated-cg="updatedCg"
        />
      </div>
      <div class="analysis-info">
        <Fen
          :fen="currentFen"
          :key="currentFen"
          @update-position="newPosition"
        />
        <div class="engine-status">
          <span class="engine-stat-value" :class="{ active: isRunning }">{{
            updateAnalysisStatus
          }}</span>
        </div>
        <EngineStats :engineInfo="engine_info" :sideToMove="sideToMove" />

        <div style="margin-top: 5px; margin-bottom: 5px">
          <v-tabs v-model="activeTabIndex" class="info-nav">
            <v-tab v-for="element in smallNavbar">
              {{ element.name }}
            </v-tab>
          </v-tabs>
        </div>
        <div class="info-content">
          <div class="nav-main-content">
            <EngineLines
              v-show="activeTab == 'engine-lines'"
              @send-moves="playMoves"
              :engineLines="engineLines"
              :fen="currentFen"
            />
            <EngineButtons
              v-if="activeTab == 'prompt'"
              @engine-command="sendEngineCommand"
              :go="status === '' || status === 'IDLE'"
              :status="isRunning"
              :key="isRunning.toString()"
            />
          </div>
          <div class="nav-secondary-content">
            <Pgn
              class="game-pgn"
              @send-pgn-moves="parsePgn"
              :movehistory="moveHistorySan"
              :key="currentFen"
            />
            <div class="analysis-graph">
              <apexchart
                height="100%"
                :options="options"
                :series="series"
                type="line"
              />
            </div>
          </div>
        </div>
      </div>
    </main>
    <Sidebar />
  </div>
</template>

<style>
@import "@/assets/styles/chessground-theme.css";
@import "@/assets/styles/chessground-pieces.css";
@import "@/assets/styles/chessground.css";

main.analysis {
  padding: 1rem;
  color: aliceblue;
  height: 100vh;

  display: flex;
  box-sizing: border-box;
}

h1 {
  font-size: 2rem;
  font-weight: 400;
  color: rgb(252, 241, 222);
}

.game {
  display: flex;
  flex-direction: column;
  flex: 0 0 60%;
  box-sizing: border-box;
  max-width: 60%;
}

.analysis-info {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.engine-status {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-evenly;
  align-items: center;
  background-color: var(--bg-tertiary);
  color: white;
  padding: 10px;
  margin-bottom: 5px;
  box-sizing: border-box;
  border-radius: 5px;
}

.engine-status .active {
  color: #22c55e;
}

.engine-status {
  color: #f43f5e;
}

.info-content {
  margin-top: 10px;
  flex: 1;
  display: flex;
  flex-wrap: nowrap;
  flex-direction: column;
}

.nav-main-content {
  display: flex;
  flex-direction: column;
  overflow-y: scroll;
  overflow-x: hidden;
  flex-grow: 0;
  height: calc(50vh - 100px);
  background-color: var(--bg-secondary);
  border-radius: 5px;
  margin-bottom: 5px;
}

.nav-secondary-content {
  display: flex;
  flex-direction: column;
  flex-grow: 0 !important;
  height: calc(40vh - 100px);
  margin-bottom: 20px;
  gap: 10px;
}

.game-pgn {
  flex-basis: calc(50% - 5px);
  overflow-y: scroll;
  overflow-x: hidden;
}

.analysis-graph {
  flex-basis: calc(45% - 5px);
}
</style>

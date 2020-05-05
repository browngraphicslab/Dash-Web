import * as React from "react";
import { observer } from "mobx-react";
import { observable, action } from "mobx";
import { Doc } from "../../../../new_fields/Doc";
import { NumCast, StrCast } from "../../../../new_fields/Types";
import { DimUnit } from "./CollectionMulticolumnView";
import { UndoManager } from "../../../util/UndoManager";

interface ResizerProps {
    width: number;
    columnUnitLength(): number | undefined;
    toLeft?: Doc;
    toRight?: Doc;
    select: (isCtrlPressed: boolean) => void;
}

const resizerOpacity = 1;

@observer
export default class ResizeBar extends React.Component<ResizerProps> {
    @observable private isHoverActive = false;
    @observable private isResizingActive = false;
    private _resizeUndo?: UndoManager.Batch;

    @action
    private registerResizing = (e: React.PointerEvent<HTMLDivElement>) => {
        this.props.select(false);
        e.stopPropagation();
        e.preventDefault();
        window.removeEventListener("pointermove", this.onPointerMove);
        window.removeEventListener("pointerup", this.onPointerUp);
        window.addEventListener("pointermove", this.onPointerMove);
        window.addEventListener("pointerup", this.onPointerUp);
        this.isResizingActive = true;
        this._resizeUndo = UndoManager.StartBatch("multcol resizing");
    }

    private onPointerMove = ({ movementX }: PointerEvent) => {
        const { toLeft, toRight, columnUnitLength } = this.props;
        const movingRight = movementX > 0;
        const toNarrow = movingRight ? toRight : toLeft;
        const toWiden = movingRight ? toLeft : toRight;
        const unitLength = columnUnitLength();
        if (unitLength) {
            if (toNarrow) {
                const scale = StrCast(toNarrow._dimUnit, "*") === DimUnit.Ratio ? unitLength : 1;
                toNarrow._dimMagnitude = Math.max(0.05, NumCast(toNarrow._dimMagnitude, 1) - Math.abs(movementX) / scale);
            }
            if (toWiden) {
                const scale = StrCast(toWiden._dimUnit, "*") === DimUnit.Ratio ? unitLength : 1;
                toWiden._dimMagnitude = Math.max(0.05, NumCast(toWiden._dimMagnitude, 1) + Math.abs(movementX) / scale);
            }
        }
    }

    private get isActivated() {
        const { toLeft, toRight } = this.props;
        if (toLeft && toRight) {
            if (StrCast(toLeft._dimUnit, "*") === DimUnit.Pixel && StrCast(toRight._dimUnit, "*") === DimUnit.Pixel) {
                return false;
            }
            return true;
        } else if (toLeft) {
            if (StrCast(toLeft._dimUnit, "*") === DimUnit.Pixel) {
                return false;
            }
            return true;
        } else if (toRight) {
            if (StrCast(toRight._dimUnit, "*") === DimUnit.Pixel) {
                return false;
            }
            return true;
        }
        return false;
    }

    @action
    private onPointerUp = () => {
        this.isResizingActive = false;
        this.isHoverActive = false;
        window.removeEventListener("pointermove", this.onPointerMove);
        window.removeEventListener("pointerup", this.onPointerUp);
        this._resizeUndo?.end();
        this._resizeUndo = undefined;
    }

    render() {
        return (
            <div
                className={"multiColumnResizer"}
                style={{
                    width: this.props.width,
                    opacity: this.isActivated && this.isHoverActive ? resizerOpacity : 0
                }}
                onPointerEnter={action(() => this.isHoverActive = true)}
                onPointerLeave={action(() => !this.isResizingActive && (this.isHoverActive = false))}
            >
                <div className={"multiColumnResizer-hdl"} onPointerDown={e => this.registerResizing(e)} />
            </div>
        );
    }

}
import * as React from "react";
import { observer } from "mobx-react";
import { observable, action } from "mobx";
import { Doc } from "../../../../fields/Doc";
import { NumCast, StrCast } from "../../../../fields/Types";
import { DimUnit } from "./CollectionMultirowView";
import { UndoManager } from "../../../util/UndoManager";
import { StyleProp } from "../../StyleProvider";
import { StyleProviderFunc } from "../../nodes/DocumentView";

interface ResizerProps {
    height: number;
    styleProvider?: StyleProviderFunc;
    isContentActive?: () => boolean;
    columnUnitLength(): number | undefined;
    toTop?: Doc;
    toBottom?: Doc;
}

const resizerOpacity = 1;

@observer
export default class ResizeBar extends React.Component<ResizerProps> {
    @observable private isHoverActive = false;
    @observable private isResizingActive = false;
    private _resizeUndo?: UndoManager.Batch;

    @action
    private registerResizing = (e: React.PointerEvent<HTMLDivElement>) => {
        e.stopPropagation();
        e.preventDefault();
        window.removeEventListener("pointermove", this.onPointerMove);
        window.removeEventListener("pointerup", this.onPointerUp);
        window.addEventListener("pointermove", this.onPointerMove);
        window.addEventListener("pointerup", this.onPointerUp);
        this.isResizingActive = true;
        this._resizeUndo = UndoManager.StartBatch("multcol resizing");
    }

    private onPointerMove = ({ movementY }: PointerEvent) => {
        const { toTop: toTop, toBottom: toBottom, columnUnitLength } = this.props;
        const movingDown = movementY > 0;
        const toNarrow = movingDown ? toBottom : toTop;
        const toWiden = movingDown ? toTop : toBottom;
        const unitLength = columnUnitLength();
        if (unitLength) {
            if (toNarrow) {
                const scale = StrCast(toNarrow._dimUnit, "*") === DimUnit.Ratio ? unitLength : 1;
                toNarrow._dimMagnitude = Math.max(0.05, NumCast(toNarrow._dimMagnitude, 1) - Math.abs(movementY) / scale);
            }
            if (toWiden) {
                const scale = StrCast(toWiden._dimUnit, "*") === DimUnit.Ratio ? unitLength : 1;
                toWiden._dimMagnitude = Math.max(0.05, NumCast(toWiden._dimMagnitude, 1) + Math.abs(movementY) / scale);
            }
        }
    }

    private get isActivated() {
        const { toTop, toBottom } = this.props;
        if (toTop && toBottom) {
            if (StrCast(toTop._dimUnit, "*") === DimUnit.Pixel && StrCast(toBottom._dimUnit, "*") === DimUnit.Pixel) {
                return false;
            }
            return true;
        } else if (toTop) {
            if (StrCast(toTop._dimUnit, "*") === DimUnit.Pixel) {
                return false;
            }
            return true;
        } else if (toBottom) {
            if (StrCast(toBottom._dimUnit, "*") === DimUnit.Pixel) {
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
        return <div className="multiRowResizer"
            style={{
                height: this.props.height,
                backgroundColor: !this.props.isContentActive?.() ? "" : this.props.styleProvider?.(undefined, undefined, StyleProp.WidgetColor)
            }}
            onPointerEnter={action(() => this.isHoverActive = true)}
            onPointerLeave={action(() => !this.isResizingActive && (this.isHoverActive = false))}
        >
            <div className={"multiRowResizer-hdl"} onPointerDown={e => this.registerResizing(e)} />
        </div>;
    }

}
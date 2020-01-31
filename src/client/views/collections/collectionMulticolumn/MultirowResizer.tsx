import * as React from "react";
import { observer } from "mobx-react";
import { observable, action } from "mobx";
import { Doc } from "../../../../new_fields/Doc";
import { NumCast, StrCast } from "../../../../new_fields/Types";
import { HeightUnit } from "./CollectionMultirowView";

interface ResizerProps {
    height: number;
    columnUnitLength(): number | undefined;
    toTop?: Doc;
    toBottom?: Doc;
}

enum ResizeMode {
    Global = "blue",
    Pinned = "red",
    Undefined = "black"
}

const resizerOpacity = 1;

@observer
export default class ResizeBar extends React.Component<ResizerProps> {
    @observable private isHoverActive = false;
    @observable private isResizingActive = false;
    @observable private resizeMode = ResizeMode.Undefined;

    @action
    private registerResizing = (e: React.PointerEvent<HTMLDivElement>, mode: ResizeMode) => {
        e.stopPropagation();
        e.preventDefault();
        this.resizeMode = mode;
        window.removeEventListener("pointermove", this.onPointerMove);
        window.removeEventListener("pointerup", this.onPointerUp);
        window.addEventListener("pointermove", this.onPointerMove);
        window.addEventListener("pointerup", this.onPointerUp);
        this.isResizingActive = true;
    }

    private onPointerMove = ({ movementY }: PointerEvent) => {
        const { toTop: toTop, toBottom: toBottom, columnUnitLength } = this.props;
        const movingDown = movementY > 0;
        const toNarrow = movingDown ? toBottom : toTop;
        const toWiden = movingDown ? toTop : toBottom;
        const unitLength = columnUnitLength();
        if (unitLength) {
            if (toNarrow) {
                const { heightUnit, heightMagnitude } = toNarrow;
                const scale = heightUnit === HeightUnit.Ratio ? unitLength : 1;
                toNarrow.heightMagnitude = NumCast(heightMagnitude) - Math.abs(movementY) / scale;
            }
            if (this.resizeMode === ResizeMode.Pinned && toWiden) {
                const { heightUnit, heightMagnitude } = toWiden;
                const scale = heightUnit === HeightUnit.Ratio ? unitLength : 1;
                toWiden.heightMagnitude = NumCast(heightMagnitude) + Math.abs(movementY) / scale;
            }
        }
    }

    private get isActivated() {
        const { toTop, toBottom } = this.props;
        if (toTop && toBottom) {
            if (StrCast(toTop.heightUnit) === HeightUnit.Pixel && StrCast(toBottom.heightUnit) === HeightUnit.Pixel) {
                return false;
            }
            return true;
        } else if (toTop) {
            if (StrCast(toTop.heightUnit) === HeightUnit.Pixel) {
                return false;
            }
            return true;
        } else if (toBottom) {
            if (StrCast(toBottom.heightUnit) === HeightUnit.Pixel) {
                return false;
            }
            return true;
        }
        return false;
    }

    @action
    private onPointerUp = () => {
        this.resizeMode = ResizeMode.Undefined;
        this.isResizingActive = false;
        this.isHoverActive = false;
        window.removeEventListener("pointermove", this.onPointerMove);
        window.removeEventListener("pointerup", this.onPointerUp);
    }

    render() {
        return (
            <div
                className={"resizer"}
                style={{
                    height: this.props.height,
                    opacity: this.isActivated && this.isHoverActive ? resizerOpacity : 0
                }}
                onPointerEnter={action(() => this.isHoverActive = true)}
                onPointerLeave={action(() => !this.isResizingActive && (this.isHoverActive = false))}
            >
                <div
                    className={"internal"}
                    onPointerDown={e => this.registerResizing(e, ResizeMode.Pinned)}
                    style={{ backgroundColor: this.resizeMode }}
                />
                <div
                    className={"internal"}
                    onPointerDown={e => this.registerResizing(e, ResizeMode.Global)}
                    style={{ backgroundColor: this.resizeMode }}
                />
            </div>
        );
    }

}
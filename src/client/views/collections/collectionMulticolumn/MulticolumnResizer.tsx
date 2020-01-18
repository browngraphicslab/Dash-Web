import * as React from "react";
import { observer } from "mobx-react";
import { observable, action } from "mobx";
import { Doc } from "../../../../new_fields/Doc";
import { NumCast, StrCast } from "../../../../new_fields/Types";

interface ResizerProps {
    width: number;
    columnUnitLength(): number | undefined;
    toLeft?: Doc;
    toRight?: Doc;
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

    private onPointerMove = ({ movementX }: PointerEvent) => {
        const { toLeft, toRight, columnUnitLength } = this.props;
        const movingRight = movementX > 0;
        const toNarrow = movingRight ? toRight : toLeft;
        const toWiden = movingRight ? toLeft : toRight;
        const unitLength = columnUnitLength();
        if (unitLength) {
            if (toNarrow) {
                const { widthUnit, widthMagnitude } = toNarrow;
                const scale = widthUnit === "*" ? unitLength : 1;
                toNarrow.widthMagnitude = NumCast(widthMagnitude) - Math.abs(movementX) / scale;
            }
            if (this.resizeMode === ResizeMode.Pinned && toWiden) {
                const { widthUnit, widthMagnitude } = toWiden;
                const scale = widthUnit === "*" ? unitLength : 1;
                toWiden.widthMagnitude = NumCast(widthMagnitude) + Math.abs(movementX) / scale;
            }
        }
    }

    private get isActivated() {
        const { toLeft, toRight } = this.props;
        if (toLeft && toRight) {
            if (StrCast(toLeft.widthUnit) === "px" && StrCast(toRight.widthUnit) === "px") {
                return false;
            }
            return true;
        } else if (toLeft) {
            if (StrCast(toLeft.widthUnit) === "px") {
                return false;
            }
            return true;
        } else if (toRight) {
            if (StrCast(toRight.widthUnit) === "px") {
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
                    width: this.props.width,
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
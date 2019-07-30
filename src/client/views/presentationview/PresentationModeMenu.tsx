import React = require("react");
import { observable, action, runInAction } from "mobx";
import "./PresentationModeMenu.scss";
import { observer } from "mobx-react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";


export interface PresModeMenuProps {
    next: () => void;
    back: () => void;
    presStatus: boolean;
    startOrResetPres: () => void;
    closePresMode: () => void;
}

/**
 * This class is responsible for modeling of the Presentation Mode Menu. The menu allows
 * user to navigate through presentation elements, and start/stop the presentation.
 */
@observer
export default class PresModeMenu extends React.Component<PresModeMenuProps> {

    @observable private _top: number = 20;
    @observable private _right: number = 0;
    @observable private _opacity: number = 1;
    @observable private _transition: string = "opacity 0.5s";
    @observable private _transitionDelay: string = "";


    private _mainCont: React.RefObject<HTMLDivElement> = React.createRef();

    /**
     * The function that changes the coordinates of the menu, depending on the
     * movement of the mouse when it's being dragged.
     */
    @action
    dragging = (e: PointerEvent) => {
        this._right -= e.movementX;
        this._top += e.movementY;

        e.stopPropagation();
        e.preventDefault();
    }

    /**
     * The function that removes the event listeners that are responsible for
     * dragging of the menu.
     */
    dragEnd = (e: PointerEvent) => {
        document.removeEventListener("pointermove", this.dragging);
        document.removeEventListener("pointerup", this.dragEnd);
        e.stopPropagation();
        e.preventDefault();
    }

    /**
     * The function that starts the dragging of the presentation mode menu. When
     * the lines on further right are clicked on.
     */
    dragStart = (e: React.PointerEvent) => {
        document.removeEventListener("pointermove", this.dragging);
        document.addEventListener("pointermove", this.dragging);
        document.removeEventListener("pointerup", this.dragEnd);
        document.addEventListener("pointerup", this.dragEnd);

        e.stopPropagation();
        e.preventDefault();
    }

    /**
     * The function that is responsible for rendering the play or pause button, depending on the
     * status of the presentation.
     */
    renderPlayPauseButton = () => {
        if (this.props.presStatus) {
            return <button title="Reset Presentation" className="presMenu-button" onClick={this.props.startOrResetPres}><FontAwesomeIcon icon="stop" /></button>;
        } else {
            return <button title="Start Presentation From Start" className="presMenu-button" onClick={this.props.startOrResetPres}><FontAwesomeIcon icon="play" /></button>;
        }
    }

    render() {
        return (
            <div className="presMenu-cont" ref={this._mainCont}
                style={{ right: this._right, top: this._top, opacity: this._opacity, transition: this._transition, transitionDelay: this._transitionDelay }}>
                <button title="Back" className="presMenu-button" onClick={this.props.back}><FontAwesomeIcon icon={"arrow-left"} /></button>
                {this.renderPlayPauseButton()}
                <button title="Next" className="presMenu-button" onClick={this.props.next}><FontAwesomeIcon icon={"arrow-right"} /></button>
                <button className="presMenu-button" title="Close Presentation Menu" onClick={this.props.closePresMode}>
                    <FontAwesomeIcon icon="times" size="lg" />
                </button>
                <div className="presMenu-dragger" onPointerDown={this.dragStart} style={{ width: "20px" }} />
            </div >
        );
    }




}
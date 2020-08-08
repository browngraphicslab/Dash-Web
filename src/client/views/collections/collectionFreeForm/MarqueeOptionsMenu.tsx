import React = require("react");
import AntimodeMenu from "../../AntimodeMenu";
import { observer } from "mobx-react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { unimplementedFunction } from "../../../../Utils";
import { undoBatch } from "../../../util/UndoManager";
import { Tooltip } from "@material-ui/core";

@observer
export default class MarqueeOptionsMenu extends AntimodeMenu {
    static Instance: MarqueeOptionsMenu;

    public createCollection: (e: KeyboardEvent | React.PointerEvent | undefined) => void = unimplementedFunction;
    public delete: (e: KeyboardEvent | React.PointerEvent | undefined) => void = unimplementedFunction;
    public summarize: (e: KeyboardEvent | React.PointerEvent | undefined) => void = unimplementedFunction;
    public inkToText: (e: KeyboardEvent | React.PointerEvent | undefined) => void = unimplementedFunction;
    public showMarquee: () => void = unimplementedFunction;
    public hideMarquee: () => void = unimplementedFunction;

    constructor(props: Readonly<{}>) {
        super(props);

        MarqueeOptionsMenu.Instance = this;
    }

    render() {
        const buttons = [
            <Tooltip title={<><div className="dash-tooltip">Create a Collection</div></>} placement="bottom">
                <button
                    className="antimodeMenu-button"
                    key="group"
                    onPointerDown={this.createCollection}>
                    <FontAwesomeIcon icon="object-group" size="lg" />
                </button>
            </Tooltip>,
            <Tooltip title={<><div className="dash-tooltip">Summarize Documents</div></>} placement="bottom">
                <button
                    className="antimodeMenu-button"
                    key="summarize"
                    onPointerDown={this.summarize}>
                    <FontAwesomeIcon icon="compress-arrows-alt" size="lg" />
                </button>
            </Tooltip>,
            <Tooltip title={<><div className="dash-tooltip">Delete Documents</div></>} placement="bottom">
                <button
                    className="antimodeMenu-button"
                    key="delete"
                    onPointerDown={this.delete}>
                    <FontAwesomeIcon icon="trash-alt" size="lg" />
                </button>
            </Tooltip>,
            <Tooltip title={<><div className="dash-tooltip">Change to Text</div></>} placement="bottom">
                <button
                    className="antimodeMenu-button"
                    key="inkToText"
                    onPointerDown={this.inkToText}>
                    <FontAwesomeIcon icon="font" size="lg" />
                </button>
            </Tooltip>,
        ];
        return this.getElement(buttons);
    }
}
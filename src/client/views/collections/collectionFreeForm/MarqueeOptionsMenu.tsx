import React = require("react");
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Tooltip } from "@material-ui/core";
import { observer } from "mobx-react";
import { unimplementedFunction } from "../../../../Utils";
import { AntimodeMenu, AntimodeMenuProps } from "../../AntimodeMenu";

@observer
export class MarqueeOptionsMenu extends AntimodeMenu<AntimodeMenuProps> {
    static Instance: MarqueeOptionsMenu;

    public createCollection: (e: KeyboardEvent | React.PointerEvent | undefined) => void = unimplementedFunction;
    public delete: (e: KeyboardEvent | React.PointerEvent | undefined) => void = unimplementedFunction;
    public summarize: (e: KeyboardEvent | React.PointerEvent | undefined) => void = unimplementedFunction;
    public inkToText: (e: KeyboardEvent | React.PointerEvent | undefined) => void = unimplementedFunction;
    public showMarquee: () => void = unimplementedFunction;
    public hideMarquee: () => void = unimplementedFunction;
    public pinWithView: (e: KeyboardEvent | React.PointerEvent | undefined) => void = unimplementedFunction;

    constructor(props: Readonly<{}>) {
        super(props);

        MarqueeOptionsMenu.Instance = this;
    }

    render() {
        const buttons = [
            <Tooltip key="group" title={<><div className="dash-tooltip">Create a Collection</div></>} placement="bottom">
                <button
                    className="antimodeMenu-button"
                    onPointerDown={this.createCollection}>
                    <FontAwesomeIcon icon="object-group" size="lg" />
                </button>
            </Tooltip>,
            <Tooltip key="summarize" title={<><div className="dash-tooltip">Summarize Documents</div></>} placement="bottom">
                <button
                    className="antimodeMenu-button"
                    onPointerDown={this.summarize}>
                    <FontAwesomeIcon icon="compress-arrows-alt" size="lg" />
                </button>
            </Tooltip>,
            <Tooltip key="delete" title={<><div className="dash-tooltip">Delete Documents</div></>} placement="bottom">
                <button
                    className="antimodeMenu-button"
                    onPointerDown={this.delete}>
                    <FontAwesomeIcon icon="trash-alt" size="lg" />
                </button>
            </Tooltip>,
            <Tooltip key="inkToText" title={<><div className="dash-tooltip">Change to Text</div></>} placement="bottom">
                <button
                    className="antimodeMenu-button"
                    onPointerDown={this.inkToText}>
                    <FontAwesomeIcon icon="font" size="lg" />
                </button>
            </Tooltip>,
            <Tooltip key="pinWithView" title={<><div className="dash-tooltip">Pin to presentation with selected view</div></>} placement="bottom">
                <button
                    className="antimodeMenu-button"
                    onPointerDown={this.pinWithView}>
                    <FontAwesomeIcon icon="map-pin" size="lg" />
                    <div style={{ position: 'relative', fontSize: 25, fontWeight: 700, transform: 'translate(-4px, -22px)', color: 'rgba(250,250,250,0.55)' }}>V</div>
                </button>
            </Tooltip>,
        ];
        return this.getElement(buttons);
    }
}
import React = require("react");
import AntimodeMenu from "../../AntimodeMenu";
import { observer } from "mobx-react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { unimplementedFunction } from "../../../../Utils";

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
            <button
                className="antimodeMenu-button"
                title="Create a Collection"
                key="group"
                onPointerDown={this.createCollection}>
                <FontAwesomeIcon icon="object-group" size="lg" />
            </button>,
            <button
                className="antimodeMenu-button"
                title="Summarize Documents"
                key="summarize"
                onPointerDown={this.summarize}>
                <FontAwesomeIcon icon="compress-arrows-alt" size="lg" />
            </button>,
            <button
                className="antimodeMenu-button"
                title="Delete Documents"
                key="delete"
                onPointerDown={this.delete}>
                <FontAwesomeIcon icon="trash-alt" size="lg" />
            </button>,
            <button
                className="antimodeMenu-button"
                title="Change to Text"
                key="inkToText"
                onPointerDown={this.inkToText}>
                <FontAwesomeIcon icon="font" size="lg" />
            </button>,
        ];
        return this.getElement(buttons);
    }
}
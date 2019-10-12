import React = require("react")
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
    public showMarquee: () => void = unimplementedFunction;
    public hideMarquee: () => void = unimplementedFunction;

    constructor(props: Readonly<{}>) {
        super(props);

        MarqueeOptionsMenu.Instance = this;
    }

    render() {
        let buttons = [
            <button
                className="antimodeMenu-button"
                title="Create a Collection"
                onPointerDown={this.createCollection}
                onPointerLeave={this.hideMarquee}
                onPointerEnter={this.showMarquee}>
                <FontAwesomeIcon icon="object-group" size="lg" />
            </button>,
            <button
                className="antimodeMenu-button"
                title="Summarize Documents"
                onPointerDown={this.summarize}
                onPointerLeave={this.hideMarquee}
                onPointerEnter={this.showMarquee}>
                <FontAwesomeIcon icon="compress-arrows-alt" size="lg" />
            </button>,
            <button
                className="antimodeMenu-button"
                title="Delete Documents"
                onPointerDown={this.delete}
                onPointerLeave={this.hideMarquee}
                onPointerEnter={this.showMarquee}>
                <FontAwesomeIcon icon="trash-alt" size="lg" />
            </button>,
        ]
        return this.getElement(buttons);
    }
}
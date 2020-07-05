import React = require("react");
import { observer } from "mobx-react";
import { documentSchema } from "../../../fields/documentSchemas";
import { makeInterface } from "../../../fields/Schema";
import "./LinkCreatedBox.scss";
import { observable, action } from "mobx";
import { Fade } from "@material-ui/core";


@observer
export class LinkCreatedBox extends React.Component<{}> {

    @observable public static linkCreated: boolean = false;
    @observable public static popupX: number = 600;
    @observable public static popupY: number = 250;

    @action
    public static changeLinkCreated = () => {
        LinkCreatedBox.linkCreated = !LinkCreatedBox.linkCreated;
    }

    render() {
        return <Fade in={LinkCreatedBox.linkCreated}>
            <div className="linkCreatedBox-fade"
                style={{
                    left: LinkCreatedBox.popupX ? LinkCreatedBox.popupX : 600,
                    top: LinkCreatedBox.popupY ? LinkCreatedBox.popupY : 250,
                }}>Link Created</div>
        </Fade>;
    }
} 
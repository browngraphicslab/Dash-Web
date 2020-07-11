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
    @observable public static popupX: number = 500;
    @observable public static popupY: number = 150;

    @action
    public static changeLinkCreated = () => {
        LinkCreatedBox.linkCreated = !LinkCreatedBox.linkCreated;
    }

    render() {
        return <Fade in={LinkCreatedBox.linkCreated}>
            <div className="linkCreatedBox-fade"
                style={{
                    left: LinkCreatedBox.popupX ? LinkCreatedBox.popupX : 500,
                    top: LinkCreatedBox.popupY ? LinkCreatedBox.popupY : 150,
                }}>Link Created</div>
        </Fade>;
    }
} 
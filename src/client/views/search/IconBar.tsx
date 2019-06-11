import * as React from 'react';
import { observer } from 'mobx-react';
import { observable, action, runInAction } from 'mobx';
import "./SearchBox.scss";
import "./IconBar.scss";
import * as anime from 'animejs';
import { DocTypes } from '../../documents/Documents';
import { faSearch, faFilePdf, faFilm, faImage, faObjectGroup, faStickyNote, faMusic, faLink, faChartBar, faGlobeAsia, faBan } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { library } from '@fortawesome/fontawesome-svg-core';
import * as _ from "lodash";


library.add(faSearch);
library.add(faObjectGroup);
library.add(faImage);
library.add(faStickyNote);
library.add(faFilePdf);
library.add(faFilm);
library.add(faMusic);
library.add(faLink);
library.add(faChartBar);
library.add(faGlobeAsia);
library.add(faBan);

export interface IconBarProps {
    updateIcon(newIcons: string[]): void;
    getIcons(): string[];
}

@observer
export class IconBar extends React.Component<IconBarProps> {

    @observable newIcons: string[] = [];
    @observable selectedStyle = {
        backgroundColor: "#121721"
    }
    @observable unselectedStyle = {
        backgroundColor: "#c2c2c5"
    }

    //changes colors of buttons on click - not sure if this is the best method (it probably isn't)
    //but i spent a ton of time on it and this is the only thing i could get to work
    componentDidMount = () => {

        let buttons = document.querySelectorAll<HTMLDivElement>(".type-icon").forEach(node =>
            node.addEventListener('click', function () {
                if (this.style.backgroundColor === "rgb(194, 194, 197)") {
                    this.style.backgroundColor = "#121721";
                }
                else {
                    this.style.backgroundColor = "#c2c2c5"
                }
            })
        );

    }

    onClick = (value: string) => {
        let oldIcons = this.props.getIcons()
        if (value === DocTypes.NONE) {
            this.newIcons = [value];
            // if its none, change the color of all the other circles
            document.querySelectorAll<HTMLDivElement>(".type-icon").forEach(node => {
                if (node.id === "none") {
                    node.style.backgroundColor = "#c2c2c5";
                }
                else {
                    node.style.backgroundColor = "#121721";
                }
            }
            );
        }
        else {
            //turns "none" button off
            let noneDoc = document.getElementById(DocTypes.NONE)
            if (noneDoc) {
                noneDoc.style.backgroundColor = "#121721";
            }
            if (oldIcons.includes(value)) {
                this.newIcons = _.remove(oldIcons, value);
                if (this.newIcons.length === 0) {
                    this.newIcons = [DocTypes.NONE];
                }
            }
            else {
                this.newIcons = oldIcons;
                if (this.newIcons.length === 1 && this.newIcons[0] === DocTypes.NONE) {
                    this.newIcons = [value]
                }
                else { this.newIcons.push(value); }
            }
        }
        this.props.updateIcon(this.newIcons)

    }

    render() {

        return (
            <div>
                <div className="icon-bar">
                    <div className="type-icon" id="none"
                        onClick={() => { this.onClick(DocTypes.NONE) }}>
                        <FontAwesomeIcon className="fontawesome-icon" style={{ order: -2 }} icon={faBan} />
                    </div>
                    <div className="type-icon"
                        onClick={() => { this.onClick(DocTypes.PDF) }}>
                        <FontAwesomeIcon className="fontawesome-icon" style={{ order: 0 }} icon={faFilePdf} />
                    </div>
                    <div className="type-icon"
                        onClick={() => { this.onClick(DocTypes.HIST) }}>
                        <FontAwesomeIcon className="fontawesome-icon" style={{ order: 1 }} icon={faChartBar} />
                    </div>
                    <div className="type-icon"
                        onClick={() => { this.onClick(DocTypes.COL) }}>
                        <FontAwesomeIcon className="fontawesome-icon" style={{ order: 2 }} icon={faObjectGroup} />
                    </div>
                    <div className="type-icon"
                        onClick={() => { this.onClick(DocTypes.IMG) }}>
                        <FontAwesomeIcon className="fontawesome-icon" style={{ order: 3 }} icon={faImage} />
                    </div>
                    <div className="type-icon"
                        onClick={() => { this.onClick(DocTypes.VID) }}>
                        <FontAwesomeIcon className="fontawesome-icon" style={{ order: 4 }} icon={faFilm} />
                    </div>
                    <div className="type-icon"
                        onClick={() => { this.onClick(DocTypes.WEB) }}>
                        <FontAwesomeIcon className="fontawesome-icon" style={{ order: 5 }} icon={faGlobeAsia} />
                    </div>
                    <div className="type-icon"
                        onClick={() => { this.onClick(DocTypes.LINK) }}>
                        <FontAwesomeIcon className="fontawesome-icon" style={{ order: 6 }} icon={faLink} />
                    </div>
                    <div className="type-icon"
                        onClick={() => { this.onClick(DocTypes.AUDIO) }}>
                        <FontAwesomeIcon className="fontawesome-icon" style={{ order: 7 }} icon={faMusic} />
                    </div>
                    <div className="type-icon"
                        onClick={() => { this.onClick(DocTypes.TEXT) }}>
                        <FontAwesomeIcon className="fontawesome-icon" style={{ order: 8 }} icon={faStickyNote} />
                    </div>
                </div>
            </div>
        )
    }
}

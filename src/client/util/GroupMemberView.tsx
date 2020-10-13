import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, observable } from "mobx";
import { observer } from "mobx-react";
import * as React from "react";
import Select from "react-select";
import { Doc } from "../../fields/Doc";
import { StrCast } from "../../fields/Types";
import { MainViewModal } from "../views/MainViewModal";
import { GroupManager, UserOptions } from "./GroupManager";
import "./GroupMemberView.scss";

interface GroupMemberViewProps {
    group: Doc;
    onCloseButtonClick: () => void;
}

@observer
export class GroupMemberView extends React.Component<GroupMemberViewProps> {

    @observable private memberSort: "ascending" | "descending" | "none" = "none";

    private get editingInterface() {
        let members: string[] = this.props.group ? JSON.parse(StrCast(this.props.group.members)) : [];
        members = this.memberSort === "ascending" ? members.sort() : this.memberSort === "descending" ? members.sort().reverse() : members;

        const options: UserOptions[] = this.props.group ? GroupManager.Instance.options.filter(option => !(JSON.parse(StrCast(this.props.group.members)) as string[]).includes(option.value)) : [];

        const hasEditAccess = GroupManager.Instance.hasEditAccess(this.props.group);

        return (!this.props.group ? null :
            <div className="editing-interface">
                <div className="editing-header">
                    <input
                        className="group-title"
                        style={{ marginLeft: !hasEditAccess ? "-14%" : 0 }}
                        value={StrCast(this.props.group.title || this.props.group.groupName)}
                        onChange={e => this.props.group.title = e.currentTarget.value}
                        disabled={!hasEditAccess}
                    >
                    </input>
                    <div className={"memberView-closeButton"} onClick={action(this.props.onCloseButtonClick)}>
                        <FontAwesomeIcon icon={"times"} color={"black"} size={"lg"} />
                    </div>
                    {GroupManager.Instance.hasEditAccess(this.props.group) ?
                        <div className="group-buttons">
                            <div className="add-member-dropdown">
                                <Select
                                    isSearchable={true}
                                    options={options}
                                    onChange={selectedOption => GroupManager.Instance.addMemberToGroup(this.props.group, (selectedOption as UserOptions).value)}
                                    placeholder={"Add members"}
                                    value={null}
                                    closeMenuOnSelect={true}
                                    styles={{
                                        dropdownIndicator: (base, state) => ({
                                            ...base,
                                            transition: '0.5s all ease',
                                            transform: state.selectProps.menuIsOpen ? 'rotate(180deg)' : undefined
                                        })
                                    }}
                                />
                            </div>
                            <button onClick={() => GroupManager.Instance.deleteGroup(this.props.group)}>Delete group</button>
                        </div> :
                        null}
                    <div
                        className="sort-emails"
                        style={{ paddingTop: hasEditAccess ? 0 : 35 }}
                        onClick={action(() => this.memberSort = this.memberSort === "ascending" ? "descending" : this.memberSort === "descending" ? "none" : "ascending")}>
                        Emails {this.memberSort === "ascending" ? "↑" : this.memberSort === "descending" ? "↓" : ""} {/* → */}
                    </div>
                </div>
                <hr />
                <div className="editing-contents"
                    style={{ height: hasEditAccess ? "62%" : "85%" }}
                >
                    {members.map(member => (
                        <div
                            className="editing-row"
                            key={member}
                        >
                            <div className="user-email">
                                {member}
                            </div>
                            {hasEditAccess ?
                                <div className={"remove-button"} onClick={() => GroupManager.Instance.removeMemberFromGroup(this.props.group, member)}>
                                    <FontAwesomeIcon icon={"trash-alt"} size={"sm"} />
                                </div>
                                : null}
                        </div>
                    ))}
                </div>
            </div>
        );

    }

    render() {
        return <MainViewModal
            isDisplayed={true}
            interactive={true}
            contents={this.editingInterface}
            dialogueBoxStyle={{ width: 400, height: 250 }}
            closeOnExternalClick={this.props.onCloseButtonClick}
        />;
    }


}
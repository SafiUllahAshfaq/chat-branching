import React, {useCallback, useEffect, useState} from 'react'
import ReactFlow, {
	NodeMouseHandler,
	Background,
	Controls,
	MiniMap,
	Edge,
	useNodesState,
	useEdgesState,
	MarkerType,
} from 'reactflow'
import 'reactflow/dist/style.css'
import {
	Box,
	Button,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	TextField,
} from '@mui/material'
import {fetchOpenAIResponse} from '@/utils/openai'
import {v4 as uuidv4} from 'uuid'
import {createConversation, getAllConversations} from '@/dbm/conversation.dbm'
import {createMessage} from '@/dbm/message.dbm'
import {Message} from '@prisma/client'
import {MarkdownNode, MarkdownNodeProps} from './MarkdownNode'

type NodeWithData = MarkdownNodeProps<Partial<Message> & {id: Message['id']}>['data']

const initialNodes: NodeWithData[] = []
const initialEdges: Edge[] = []

export const BranchingComponent: React.FC = () => {
	const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
	const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
	const [open, setOpen] = useState(false)
	const [question, setQuestion] = useState('')
	const [selectedNode, setSelectedNode] = useState<NodeWithData>()

	useEffect(() => {
		const fetchData = async () => {
			const conversations = await getAllConversations(true)
			const newNodes: NodeWithData[] = []
			const newEdges: Edge[] = []

			conversations.forEach(conversation => {
				conversation.messages.forEach((message, index) => {
					const nodeType = message.role === 'user' ? 'question' : 'answer'

					const messageNode: NodeWithData = {
						id: `msg-${message.id}`,
						type: 'markdownNode',
						data: {message, content: message.content, nodeType},
						position: {x: 100 * index, y: 100 + 50 * newNodes.length},
					}
					newNodes.push(messageNode)

					if (index === 0) return

					newEdges.push({
						id: `edge-${conversation.id}-${message.id}`,
						source: `msg-${message.parentId || message.id}`,
						target: messageNode.id,
						type: 'smoothstep',
						markerEnd: {
							type: MarkerType.ArrowClosed,
							width: 20,
							height: 20,
						},
					})
				})
			})

			setNodes(newNodes)
			setEdges(newEdges)
		}

		fetchData()
	}, [setEdges, setNodes])

	const onClickCanvas = useCallback(() => {
		setOpen(true)
	}, [])

	const handleClose = useCallback(() => {
		setOpen(false)
		setQuestion('')
		setSelectedNode(undefined)
	}, [])

	const calculateNodePosition = (existingNodeId?: NodeWithData): {x: number; y: number} => {
		if (existingNodeId) {
			const existingNode = nodes.find(node => node.id === existingNodeId.id)

			if (existingNode) {
				return {x: existingNode.position.x + 200, y: existingNode.position.y + 50}
			}
		}

		return {x: Math.random() * 400, y: Math.random() * 400}
	}

	const addNode = (
		data: {content: string; id: number},
		position: {x: number; y: number},
		isQuestion: boolean,
	): NodeWithData => {
		const newNode: NodeWithData = {
			id: uuidv4(),
			type: 'markdownNode',
			data: {
				message: data,
				content: data.content,
				nodeType: isQuestion ? 'question' : 'answer',
			},
			position,
		}
		setNodes(nds => [...nds, newNode])
		return newNode
	}

	const linkNodes = ({id: source}: NodeWithData, {id: target}: NodeWithData) => {
		const newEdge: Edge = {
			id: uuidv4(),
			source,
			target,
			type: 'smoothstep',
			markerEnd: {
				type: MarkerType.ArrowClosed,
				width: 20,
				height: 20,
			},
		}
		setEdges(eds => [...eds, newEdge])
	}

	const handleSubmit = async () => {
		try {
			const newPosition = calculateNodePosition(selectedNode)
			let convId = selectedNode?.data?.message?.conversationId!

			// Create a new conversation if user clicked on the canvas
			if (!convId) {
				convId = (await createConversation(question)).id
			}

			// Create question message on the backend and get the answer from OpenAI
			const [newQuestion, answer] = await Promise.all([
				createMessage(question, 'user', convId, selectedNode?.data?.message?.id),
				fetchOpenAIResponse([{role: 'user', content: question}]),
			])

			// Create answer message on the backend
			const newAnswer = await createMessage(answer, 'bot', convId, newQuestion.id)

			// Update the UI with the new nodes and link them
			const questionNode = addNode(newQuestion, newPosition, true)
			const answerNode = addNode(newAnswer, {x: newPosition.x + 200, y: newPosition.y}, false)

			if (selectedNode) {
				linkNodes(selectedNode, questionNode)
			}

			linkNodes(questionNode, answerNode)
		} catch (error: any) {
			console.error(error.message, error)
		}

		handleClose()
	}

	const onNodeClick: NodeMouseHandler = async (_, node) => {
		setSelectedNode(node as NodeWithData)
		setOpen(true)
	}

	const handleEdit = (node: NodeWithData) => {
		setNodes(nds =>
			nds.map(n => (n.id === node.id ? {...n, data: {...n.data, isEditable: true}} : n)),
		)
	}

	const handleCopy = (node: NodeWithData) => {
		// Implement the copy logic here
		console.log('Copy node', node)
	}

	const handleDelete = (node: NodeWithData) => {
		// Implement the delete logic here
		console.log('Delete node', node)
		setNodes(nds => nds.filter(n => n.id !== node.id))
		setEdges(eds => eds.filter(e => e.source !== node.id && e.target !== node.id))
	}

	const handleContentChange = (id: string, content: string) => {
		setNodes(nds => nds.map(n => (n.id === id ? {...n, data: {...n.data, content}} : n)))
	}

	return (
		<Box sx={{flexGrow: 1}}>
			<ReactFlow
				nodes={nodes}
				edges={edges}
				onNodesChange={onNodesChange}
				onEdgesChange={onEdgesChange}
				// onNodeClick={onNodeClick}
				// onPaneClick={onClickCanvas}
				nodeTypes={React.useMemo(() => {
					return {
						markdownNode: props => (
							<MarkdownNode
								{...props}
								data={props.data}
								onEdit={handleEdit}
								onCopy={handleCopy}
								onDelete={handleDelete}
							/>
						),
					}
				}, [])}
				fitView
			>
				<MiniMap />
				<Controls />
				<Background />
			</ReactFlow>
			<Dialog open={open} onClose={handleClose}>
				<DialogTitle>
					{selectedNode ? 'Type a question' : 'Start a new conversation'}
				</DialogTitle>
				<DialogContent>
					<TextField
						autoFocus
						margin="dense"
						label="Enter your question"
						type="text"
						fullWidth
						value={question}
						onChange={e => setQuestion(e.target.value)}
					/>
				</DialogContent>
				<DialogActions>
					<Button onClick={handleClose}>Cancel</Button>
					<Button onClick={handleSubmit}>Submit</Button>
				</DialogActions>
			</Dialog>
		</Box>
	)
}

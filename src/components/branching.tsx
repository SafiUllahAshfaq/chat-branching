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
	Node,
	NodeProps,
} from 'reactflow'
import 'reactflow/dist/style.css'
import {
	Box,
	Button,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	Snackbar,
	TextField,
	Typography,
} from '@mui/material'
import {fetchOpenAIResponse, GptMessage} from '@/utils/openai'
import {v4 as uuidv4} from 'uuid'
import {createConversation, getAllConversations} from '@/dbm/conversation.dbm'
import {
	createMessage,
	deleteMessageWithChildren,
	getParentMessages,
	updateMessage,
} from '@/dbm/message.dbm'
import {Message} from '@prisma/client'
import {MarkdownNode, MarkdownNodeData} from './MarkdownNode'
import {FiCopy, FiPlus, FiTrash2} from 'react-icons/fi'
import {CircularProgress} from '@mui/material'
import {BiSelectMultiple} from 'react-icons/bi'

type MarkdownNodeDataProps = MarkdownNodeData<Partial<Message>>
type NodeWithData = Node<MarkdownNodeDataProps, 'markdownNode'>

const initialNodes: NodeWithData[] = []
const initialEdges: Edge[] = []

export const BranchingComponent: React.FC = () => {
	const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
	const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
	const [isLoading, setIsLoading] = useState(false)
	const [openSnackBar, setOpenSnackBar] = useState(false)
	const [open, setOpen] = useState(false)
	const [isSelectable, setIsSelectable] = useState(false)
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
						data: {message, content: message.content, nodeType, isSelected: false},
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

	useEffect(() => {
		setNodes(nds =>
			nds.map(node => ({
				...node,
				data: {
					...node.data,
					isSelectable,
				},
			})),
		)
	}, [isSelectable])

	const handleCheckboxChange = (id: string, isSelected: boolean) => {
		setNodes(nds =>
			nds.map(node =>
				node.id === id
					? {
							...node,
							data: {
								...node.data,
								isSelected,
							},
					  }
					: node,
			),
		)
	}

	const handleCloseSnackbar = () => {
		setOpenSnackBar(false)
	}

	const onClickCanvas = useCallback(() => {
		setOpen(true)
	}, [])

	const handleClose = useCallback(() => {
		setOpen(false)
		setQuestion('')
		setSelectedNode(undefined)
	}, [])

	const calculateNodePosition = (
		existingNodeId?: NodeProps<MarkdownNodeDataProps>,
	): {x: number; y: number} => {
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
				isSelected: false,
			},
			position,
		}
		setNodes(nds => [...nds, newNode])
		return newNode
	}

	const updateNode = (
		id: string,
		newData: Partial<MarkdownNodeDataProps>,
		newPosition?: {x: number; y: number},
	): void => {
		setNodes(nds =>
			nds.map(node =>
				node.id === id
					? {
							...node,
							data: {...node.data, ...newData},
							position: newPosition ? newPosition : node.position,
					  }
					: node,
			),
		)
	}

	const linkNodes = (
		{id: source}: NodeProps<MarkdownNodeDataProps>,
		{id: target}: NodeWithData,
	) => {
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

	const handleEditSubmit = async (
		node: NodeProps<MarkdownNodeDataProps>,
		questionContent: string,
	) => {
		try {
			setIsLoading(true)
			// Update the current node's content
			updateNode(node.id, {
				content: questionContent,
				message: {
					...node.data.message,
					content: questionContent,
				},
			})
			// Step 1: Identify child nodes
			const childNodes = edges
				.filter(edge => edge.source === node.id)
				.map(edge => edge.target)

			// Step 2: Fetch new answer from ChatGPT
			const answer = await fetchOpenAIResponse([{role: 'user', content: questionContent}])

			// Step 3: Update child nodes
			for (const childNodeId of childNodes) {
				const childNode = nodes.find(n => n.id === childNodeId)
				if (childNode && childNode.data.message.id) {
					// Update the content of the child node
					await updateMessage(childNode.data.message.id, answer, 'assistant')
					updateNode(childNode.id, {
						content: answer,
						message: {
							...childNode.data.message,
							content: answer,
						},
					})
				}
			}
		} catch (error) {
			console.error('Error in handleEditSubmit:', error)
		} finally {
			setIsLoading(false)
		}
	}

	const handleSubmitQuestion = async (
		node: NodeProps<MarkdownNodeDataProps>,
		questionContent: string,
	) => {
		setIsLoading(true)
		try {
			const newPosition = calculateNodePosition(node)
			let convId = node?.data?.message?.conversationId!
			let messageContext: GptMessage[] = []

			updateNode(node.id, {
				...node.data,
				content: questionContent,
				message: {
					...node.data.message,
					content: questionContent,
				},
			})

			// Create a new conversation if user clicked on the canvas
			if (!convId) {
				convId = (await createConversation(questionContent)).id
			}

			const hasParent = node?.data?.message?.parentId
			if (hasParent && node?.data?.message?.id) {
				messageContext = (await getParentMessages(node?.data?.message?.id))
					.reverse()
					.map<GptMessage>(({role, content}) => ({
						role: role as GptMessage['role'],
						content,
					}))
			}

			messageContext.push({role: 'user', content: questionContent})

			const [newQuestion, answer] = await Promise.all([
				createMessage(
					questionContent,
					'user',
					convId,
					hasParent ? hasParent : node?.data?.message?.id,
				),
				fetchOpenAIResponse([{role: 'user', content: questionContent}]),
			])

			const newAnswer = await createMessage(answer, 'assistant', convId, newQuestion.id)

			const answerNode = addNode(newAnswer, {x: newPosition.x + 200, y: newPosition.y}, false)

			linkNodes(node, answerNode)
		} catch (error: any) {
			console.error(error.message, error)
		} finally {
			setIsLoading(false)
		}

		handleClose()
	}

	const handleNodeRefresh = async (node: NodeProps<MarkdownNodeDataProps>) => {
		setIsLoading(true)
		try {
			if (node?.data?.message?.content) {
				const [answer] = await Promise.all([
					fetchOpenAIResponse([{role: 'user', content: node?.data?.message?.content}]),
				])

				if (node?.data?.message?.id) {
					updateMessage(node?.data?.message?.id, answer, 'assistant')
				}
				updateNode(node.id, {
					...node.data,
					content: answer,
					message: {
						...node.data.message,
						content: answer,
					},
				})
			}
		} catch (error: any) {
			console.error(error.message, error)
		} finally {
			setIsLoading(false)
		}

		handleClose()
	}

	const onNodeClick: NodeMouseHandler = async (_, node) => {
		setSelectedNode(node as NodeWithData)
		setOpen(true)
	}

	const handleEditNode = (nodeId: NodeProps<MarkdownNodeDataProps>) => {
		// Implement your edit logic here
		console.log(`Edit node ${nodeId}`)
	}

	const handleDeleteNode = async (node: NodeProps<MarkdownNodeDataProps>) => {
		try {
			const nodeId = node.id

			if (node?.data?.message?.id) {
				await deleteMessageWithChildren(node?.data?.message?.id)
			}

			setNodes(currentNodes => {
				// Set to keep track of nodes to delete, starting with the selected node
				const nodesToDelete = new Set([nodeId])
				const edgesToDelete = new Set<string>()

				setEdges(currentEdges => {
					// Iterate over edges to find and mark all connected child nodes and their edges
					currentEdges.forEach(edge => {
						if (nodesToDelete.has(edge.source)) {
							nodesToDelete.add(edge.target)
							edgesToDelete.add(edge.id)
						}
					})

					// Return updated edges, excluding those marked for deletion
					return currentEdges.filter(edge => !edgesToDelete.has(edge.id))
				})

				// Return updated nodes, excluding those marked for deletion
				return currentNodes.filter(node => !nodesToDelete.has(node.id))
			})
		} catch (error: any) {
			console.error(error.message, error)
		}
	}

	const handleExtend = (node: NodeProps<MarkdownNodeDataProps>) => {
		setSelectedNode(node as unknown as NodeWithData)
		setOpen(true)
	}

	const handleContentChange = (id: string, content: string) => {
		setNodes(nds => nds.map(n => (n.id === id ? {...n, data: {...n.data, content}} : n)))
	}

	const addQuestionNode = (node?: NodeProps<MarkdownNodeDataProps>) => {
		const newNodeID = uuidv4()
		const position = node
			? {x: node.xPos + 200, y: node.yPos + 100}
			: {x: Math.random() * 400, y: Math.random() * 400} // Adjust position if no node is passed

		const newNode: NodeWithData = {
			id: newNodeID,
			type: 'markdownNode',
			data: {
				content: '',
				nodeType: 'question',
				message: node
					? {
							parentId: node?.data?.message?.id,
							conversationId: node?.data?.message?.conversationId,
					  }
					: {parentId: undefined, conversationId: undefined}, // Adjust data if no node is passed
				isSelected: false,
			},
			position,
		}

		setNodes(nds => nds.concat(newNode))
		if (node) {
			setEdges(eds =>
				eds.concat({
					id: uuidv4(),
					source: node.id,
					target: newNode.id,
					type: 'smoothstep',
				}),
			)
		}
	}

	const sxStyles = {
		globalIcons: {
			width: '100vw',
			position: 'absolute',
			bottom: 10,
			display: 'flex',
			justifyContent: 'center',
		},
		btn: {
			width: '50px',
			color: '#000000',
			margin: '10px',
			backgroundColor: 'rgba(0,0,0,0.1)',
			'&:hover': {
				backgroundColor: 'rgba(0,0,0,0.2)',
			},
		},
	}

	const deleteAllNodes = async () => {
		try {
			// Extract all node IDs that need to be deleted from the database
			const nodeIds = nodes
				.map(node => node.data.message.id)
				.filter(id => id !== undefined) as number[]

			// Delete nodes from the database
			await Promise.all(nodeIds.map(id => deleteMessageWithChildren(id)))

			// Clear nodes and edges from the state
			setNodes([])
			setEdges([])
			setOpen(false)
		} catch (error: any) {
			console.error('Error deleting nodes:', error.message, error)
		}
	}

	const createStringFromSelectedNodes = () => {
		const selectedNodesContent = nodes
			.filter(node => node.data.isSelected)
			.map(node => {
				const nodeType = node.data.nodeType === 'question' ? 'question' : 'answer'
				return `${nodeType}: ${node.data.content}`
			})
			.join('\n')

		navigator.clipboard
			.writeText(selectedNodesContent)
			.then(() => {
				console.log('Content copied to clipboard')
			})
			.catch(err => {
				console.error('Failed to copy: ', err)
			})
		setOpenSnackBar(true)
		setTimeout(() => {
			setOpenSnackBar(false)
		}, 3000)
		setIsSelectable(!isSelectable)
	}

	return (
		<>
			{isLoading && (
				<Box
					sx={{
						margin: -1,
						width: '100%',
						height: '100%',
						position: 'absolute',
						display: 'flex',
						justifyContent: 'center',
						alignItems: 'center',
						zIndex: 1000,
						backgroundColor: 'rgba(0,0,0,0.1)',
					}}
				>
					<CircularProgress />
				</Box>
			)}
			<Box sx={{flexGrow: 1}}>
				<ReactFlow
					nodes={nodes}
					edges={edges}
					onNodesChange={onNodesChange}
					onEdgesChange={onEdgesChange}
					nodeTypes={React.useMemo(() => {
						return {
							markdownNode: props => (
								<MarkdownNode
									{...props}
									data={props.data}
									onEdit={handleEditNode}
									onAddQuestion={addQuestionNode}
									onDelete={handleDeleteNode}
									submitQuestion={handleSubmitQuestion}
									onRefresh={handleNodeRefresh}
									isSelectable={isSelectable}
									onCheckboxChange={handleCheckboxChange} // Add this line
									submitEdit={handleEditSubmit}
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
				<Box sx={sxStyles.globalIcons}>
					<Button onClick={() => addQuestionNode()} sx={sxStyles.btn}>
						<FiPlus size={24} />
					</Button>
					<Button onClick={() => setOpen(true)} sx={sxStyles.btn}>
						<FiTrash2 size={24} />
					</Button>
					{isSelectable ? (
						<Button onClick={createStringFromSelectedNodes} sx={sxStyles.btn}>
							<FiCopy size={24} />
						</Button>
					) : (
						<Button sx={sxStyles.btn}>
							<BiSelectMultiple
								onClick={() => setIsSelectable(!isSelectable)}
								size={24}
							/>
						</Button>
					)}
				</Box>
				<Dialog open={open} onClose={handleClose}>
					<DialogTitle>Delete record</DialogTitle>
					<DialogContent>
						<Typography variant="body1" paragraph>
							Are you sure you want to delete all nodes?
						</Typography>
					</DialogContent>
					<DialogActions>
						<Button onClick={handleClose}>Cancel</Button>
						<Button onClick={deleteAllNodes}>Delete</Button>
					</DialogActions>
				</Dialog>
				<Snackbar
					anchorOrigin={{vertical: 'top', horizontal: 'center'}}
					open={openSnackBar}
					onClose={handleCloseSnackbar}
					message="Text copied to clipboard"
					key={'top' + 'center'}
				/>
			</Box>
		</>
	)
}
